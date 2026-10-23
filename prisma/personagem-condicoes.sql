-- Fase 2F: condições na ficha do personagem (fora do combate). Só acrescenta a
-- coluna; não apaga nada.
--   npx prisma db execute --file prisma/personagem-condicoes.sql
-- NÃO usar `prisma db push` neste banco: ele está diferente do schema e o push
-- apagaria tabelas e colunas (navios, colunas antigas de itens/ações).
-- Rodar de novo não muda nada.

ALTER TABLE personagens ADD COLUMN IF NOT EXISTS condicoes JSONB NOT NULL DEFAULT '[]'::jsonb;
