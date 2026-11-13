-- Chat: fecha a leitura direta de `mensagens` pela API pública do Supabase.
--
-- Hoje a tabela está sem RLS: qualquer pessoa, mesmo sem login, lê todas as
-- mensagens de todas as mesas com a chave pública (anon) do navegador. As
-- rolagens privadas do narrador ficam na sessão `<mesa>:narrador`; sem isto
-- elas seguiriam legíveis por quem souber pedir.
--
-- O app grava e lista pelo Prisma (conexão direta do servidor), que ignora RLS;
-- só a leitura do navegador (Realtime e API) passa pelas políticas abaixo.
-- Rodar no SQL Editor do Supabase. Para desfazer: alter table ... disable row level security.

alter table public.mensagens enable row level security;

-- Chat normal: qualquer usuário logado (o Realtime filtra por mesa no cliente, como hoje).
drop policy if exists mensagens_leitura on public.mensagens;
create policy mensagens_leitura on public.mensagens
  for select to authenticated
  using (session_id not like '%:narrador');

-- Rolagens privadas: só o narrador (dono) da mesa.
drop policy if exists mensagens_leitura_narrador on public.mensagens;
create policy mensagens_leitura_narrador on public.mensagens
  for select to authenticated
  using (
    session_id like '%:narrador'
    and exists (
      select 1
      from public.mesas m
      where m.id::text = split_part(session_id, ':', 1)
        and m.user_id::text = auth.uid()::text
    )
  );
