-- Fase 2E: efeitos colaterais. Bloqueios (sem PP / sem Haki por um tempo) e a
-- parte da exaustão que some no descanso longo. Só acrescenta colunas; não
-- apaga nada.
--   npx prisma db execute --file prisma/personagem-colaterais.sql
-- NÃO usar `prisma db push` neste banco: ele está diferente do schema e o push
-- apagaria tabelas e colunas (navios, colunas antigas de itens/ações).
-- Rodar de novo não muda nada.

ALTER TABLE personagens ADD COLUMN IF NOT EXISTS bloqueios JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE personagens ADD COLUMN IF NOT EXISTS exaustao_temporaria INTEGER NOT NULL DEFAULT 0;
