-- Ações: marca "Recebe Multiataque". O Multiataque da ficha (Ataque Extra,
-- itens…) só vale nas ações marcadas. Só acrescenta a coluna e marca as que já
-- recebiam; não apaga nada.
--   npx prisma db execute --file prisma/acoes-multiataque.sql
-- NÃO usar `prisma db push` neste banco: ele está diferente do schema e o push
-- apagaria tabelas e colunas (navios, colunas antigas de itens/ações).
-- Só age se a coluna ainda não existe, então rodar de novo não muda nada.
--
-- Já marcadas: ação comum (não técnica) de Ação Padrão com acerto ou arma, que
-- é onde o Multiataque valia até agora.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acoes' AND column_name = 'multiataque'
  ) THEN
    ALTER TABLE acoes ADD COLUMN multiataque BOOLEAN NOT NULL DEFAULT false;

    UPDATE acoes SET multiataque = true
    WHERE tipo = 'padrao' AND NOT tecnica
      AND (atributo_ataque IS NOT NULL OR arma_ids <> '[]'::jsonb);
  END IF;
END $$;
