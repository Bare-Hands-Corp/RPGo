-- Efeitos de ação que ficam valendo num aliado (vantagem, bônus…): guarda em
-- quem eles valem enquanto a ação está em curso. Só acrescenta a coluna.
--   npx prisma db execute --file prisma/acoes-aliado-em-curso.sql
-- NÃO usar `prisma db push` neste banco (ver prisma/acoes-alvo-e-arma.sql).
-- Rodar de novo não muda nada.

ALTER TABLE acoes ADD COLUMN IF NOT EXISTS aliado_em_curso_id TEXT;
CREATE INDEX IF NOT EXISTS acoes_aliado_em_curso_id_idx ON acoes (aliado_em_curso_id);
