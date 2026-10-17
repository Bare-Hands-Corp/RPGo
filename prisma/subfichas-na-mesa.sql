-- Subficha joga na mesa do dono: `mesa_id` igual ao do personagem dono, e a
-- ficha da mesa na própria mesa. Rodar uma vez, junto do deploy (depois do
-- converter-navios.sql):
--   npx prisma db execute --file prisma/subfichas-na-mesa.sql
-- Rodar de novo não muda nada.

UPDATE personagens s
SET mesa_id = d.mesa_id
FROM personagens d
WHERE s.dono_personagem_id = d.id
  AND s.mesa_id IS DISTINCT FROM d.mesa_id;

UPDATE personagens
SET mesa_id = dono_mesa_id
WHERE dono_mesa_id IS NOT NULL
  AND mesa_id IS DISTINCT FROM dono_mesa_id;
