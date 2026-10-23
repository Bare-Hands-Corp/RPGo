-- Fase 1 das ações: campo Alvo e adicional no acerto. Só acrescenta colunas e
-- preenche o alvo; não apaga nada.
--   npx prisma db execute --file prisma/acoes-alvo-e-arma.sql
-- NÃO usar `prisma db push` neste banco: ele está diferente do schema e o push
-- apagaria tabelas e colunas (navios, colunas antigas de itens/ações).
-- Só age se a coluna `alvo` ainda não existe, então rodar de novo não muda nada.
--
-- `alvo`: aliado vira "aliado"; ação com acerto, salvaguarda, dano ou arma
-- vira "inimigo"; o resto, "voce" (os efeitos já iam em quem usa).
--
-- Ação comum (não técnica) com arma passa a usar o dano da arma, e o campo Dano
-- vira adicional. As que já tinham o dado da arma escrito ali precisam ser
-- revistas à mão (o dano não é apagado aqui).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acoes' AND column_name = 'alvo'
  ) THEN
    ALTER TABLE acoes ADD COLUMN alvo TEXT NOT NULL DEFAULT 'nenhum';
    ALTER TABLE acoes ADD COLUMN IF NOT EXISTS bonus_acerto TEXT;

    UPDATE acoes SET alvo = 'aliado' WHERE aliado;
    UPDATE acoes SET alvo = 'inimigo'
    WHERE NOT aliado
      AND (atributo_ataque IS NOT NULL OR atributo_salv IS NOT NULL
           OR NULLIF(TRIM(dano), '') IS NOT NULL OR arma_ids <> '[]'::jsonb);
    UPDATE acoes SET alvo = 'voce' WHERE alvo = 'nenhum';
  END IF;
END $$;
