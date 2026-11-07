// Envio de e-mail por SMTP. Variáveis: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.
import nodemailer from "nodemailer";

const NOME_APP = "Hand Rolls";

// Espelho do tema padrão (lib/themes.ts): e-mail não lê variável CSS.
const COR = {
  primaria: "#5a3a22",
  destaque: "#e67e22",
  pagina: "#f0f2f5",
  cartao: "#ffffff",
  superficie: "#f8f9fa",
  texto: "#2c3e50",
  textoSec: "#7f8c8d",
  borda: "#e0e0e0",
};

let transporte: nodemailer.Transporter | null = null;

function obterTransporte(): nodemailer.Transporter | null {
  if (transporte) return transporte;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  transporte = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporte;
}

export async function enviarEmail(opcoes: { para: string; assunto: string; html: string; texto: string }) {
  const t = obterTransporte();
  if (!t) {
    // Em dev sem SMTP o conteúdo vai pro console do servidor.
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email] SMTP não configurado. Para ${opcoes.para}: ${opcoes.texto}`);
      return;
    }
    throw new Error("SMTP não configurado (SMTP_HOST, SMTP_USER, SMTP_PASS).");
  }
  await t.sendMail({
    from: process.env.EMAIL_FROM || `"${NOME_APP}" <${process.env.SMTP_USER}>`,
    to: opcoes.para,
    subject: opcoes.assunto,
    html: opcoes.html,
    text: opcoes.texto,
  });
}

function htmlDoEmail(titulo: string, corpo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:${COR.pagina};font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COR.texto};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.pagina};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
             style="max-width:480px;width:100%;background:${COR.cartao};border:1px solid ${COR.borda};border-radius:12px;overflow:hidden;">
        <tr><td style="background:${COR.primaria};padding:22px 30px;">
          <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR.destaque};">${NOME_APP}</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">${titulo}</h1>
        </td></tr>
        <tr><td style="padding:28px 30px;font-size:15px;line-height:1.6;">${corpo}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:${COR.textoSec};">E-mail automático do ${NOME_APP}.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

const TEXTOS_CODIGO = {
  verificacao: {
    assunto: `Seu código de verificação — ${NOME_APP}`,
    titulo: "Confirme seu e-mail",
    frase: "Use o código abaixo para confirmar seu e-mail.",
    aviso: "Se você não criou uma conta, ignore este e-mail.",
  },
  senha: {
    assunto: `Código para trocar a senha — ${NOME_APP}`,
    titulo: "Trocar a senha",
    frase: "Use o código abaixo para criar uma senha nova.",
    aviso: "Se não foi você, ignore este e-mail. Sua senha continua a mesma.",
  },
} as const;

export async function enviarCodigoPorEmail(
  para: string,
  codigo: string,
  finalidade: keyof typeof TEXTOS_CODIGO,
  validadeMin: number,
) {
  const t = TEXTOS_CODIGO[finalidade];
  const corpo = `
    <p style="margin:0 0 20px;">${t.frase}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${COR.superficie};border:2px dashed ${COR.primaria};border-radius:8px;margin:0 0 20px;">
      <tr><td align="center" style="padding:20px;">
        <p style="margin:0;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${COR.primaria};">${codigo}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;color:${COR.textoSec};">Vale por <strong>${validadeMin} minutos</strong>.</p>
    <p style="margin:0;font-size:14px;color:${COR.textoSec};">${t.aviso}</p>`;
  await enviarEmail({
    para,
    assunto: t.assunto,
    html: htmlDoEmail(t.titulo, corpo),
    texto: `${t.frase}\n\n${codigo}\n\nVale por ${validadeMin} minutos. ${t.aviso}`,
  });
}
