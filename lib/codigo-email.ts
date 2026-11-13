// Código de 6 dígitos por e-mail: gera, guarda só o hash e confere com limite de tentativas.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { ErroDeUso } from "@/lib/acoes";
import { traduzirErroAuth } from "@/lib/auth";
import { enviarCodigoPorEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Finalidade = "verificacao" | "senha";

export const VALIDADE_MIN = 10;
export const ESPERA_REENVIO_S = 60;
const MAX_TENTATIVAS = 5;

type Conta = { id: string; email: string; pendente: boolean };

function hashDoCodigo(userId: string, codigo: string): Buffer {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
    .update(`${userId}:${codigo.trim()}`)
    .digest();
}

export async function contaPorEmail(email: string): Promise<Conta | null> {
  const [conta] = await prisma.$queryRaw<Conta[]>`
    SELECT id::text AS id, email, coalesce((raw_app_meta_data->>'email_pendente')::boolean, false) AS pendente
    FROM auth.users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
  return conta ?? null;
}

export async function contaPorId(userId: string): Promise<Conta | null> {
  const [conta] = await prisma.$queryRaw<Conta[]>`
    SELECT id::text AS id, email, coalesce((raw_app_meta_data->>'email_pendente')::boolean, false) AS pendente
    FROM auth.users WHERE id = ${userId}::uuid LIMIT 1`;
  return conta ?? null;
}

// Segundos até poder pedir outro código (0 = já pode).
export async function esperaParaReenviar(userId: string): Promise<number> {
  const ultimo = await prisma.codigoEmail.findUnique({ where: { userId }, select: { criadoEm: true } });
  if (!ultimo) return 0;
  const passou = (Date.now() - ultimo.criadoEm.getTime()) / 1000;
  return Math.max(0, Math.ceil(ESPERA_REENVIO_S - passou));
}

// Código ainda dá pra usar (no prazo e com tentativa sobrando).
export async function temCodigoValido(userId: string, finalidade: Finalidade): Promise<boolean> {
  const n = await prisma.codigoEmail.count({
    where: { userId, finalidade, expiraEm: { gt: new Date() }, tentativas: { lt: MAX_TENTATIVAS } },
  });
  return n > 0;
}

// Gera, grava e manda o código. Troca o anterior; recusa se ele saiu há menos de 1 minuto.
export async function mandarCodigo(conta: { id: string; email: string }, finalidade: Finalidade) {
  const espera = await esperaParaReenviar(conta.id);
  if (espera > 0) throw new ErroDeUso(`Espere ${espera}s para pedir outro código.`);

  const codigo = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const dados = {
    finalidade,
    hash: hashDoCodigo(conta.id, codigo).toString("hex"),
    tentativas: 0,
    expiraEm: new Date(Date.now() + VALIDADE_MIN * 60_000),
    criadoEm: new Date(),
  };
  await prisma.codigoEmail.upsert({ where: { userId: conta.id }, create: { userId: conta.id, ...dados }, update: dados });

  try {
    await enviarCodigoPorEmail(conta.email, codigo, finalidade, VALIDADE_MIN);
  } catch (e) {
    console.error("[codigo-email] envio falhou:", e);
    await prisma.codigoEmail.deleteMany({ where: { userId: conta.id } });
    throw new ErroDeUso("Não deu para mandar o e-mail. Tente novamente.");
  }
}

// Confere o código. Toda tentativa conta antes da comparação, então pedidos em paralelo não furam o limite.
export async function conferirCodigo(userId: string, finalidade: Finalidade, codigo: string) {
  const { count } = await prisma.codigoEmail.updateMany({
    where: { userId, finalidade, expiraEm: { gt: new Date() }, tentativas: { lt: MAX_TENTATIVAS } },
    data: { tentativas: { increment: 1 } },
  });
  const registro = await prisma.codigoEmail.findUnique({ where: { userId } });

  if (!count || !registro || registro.finalidade !== finalidade) {
    if (registro?.finalidade !== finalidade) throw new ErroDeUso("Código não encontrado. Peça um novo.");
    if (registro.expiraEm.getTime() <= Date.now()) throw new ErroDeUso("Código vencido. Peça um novo.");
    throw new ErroDeUso("Muitas tentativas erradas. Peça um novo código.");
  }

  const certo = timingSafeEqual(Buffer.from(registro.hash, "hex"), hashDoCodigo(userId, codigo));
  if (!certo) {
    const restam = MAX_TENTATIVAS - registro.tentativas;
    if (restam <= 0) throw new ErroDeUso("Muitas tentativas erradas. Peça um novo código.");
    throw new ErroDeUso(`Código errado. ${restam === 1 ? "Resta 1 tentativa" : `Restam ${restam} tentativas`}.`);
  }

  // Acerto não gasta tentativa: a troca de senha confere o mesmo código duas vezes.
  await prisma.codigoEmail.update({ where: { userId }, data: { tentativas: { decrement: 1 } } });
}

export async function apagarCodigo(userId: string) {
  await prisma.codigoEmail.deleteMany({ where: { userId } });
}

// Tira da conta o email_pendente (app_metadata, que vai no JWT e o proxy lê).
export async function marcarEmailVerificado(userId: string, extra: { password?: string } = {}) {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, {
    ...extra,
    app_metadata: { email_pendente: false },
  });
  if (error) throw new ErroDeUso(traduzirErroAuth(error.message, error.code));
}
