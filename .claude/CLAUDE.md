# RPGo — Notas para o Claude

Ficha de RPG online (One Piece) com chat, rolador de dados, inventário, calendário e sistema de mesas (narrador + personagens) em tempo real.

## Stack
- **Frontend + Backend:** Next.js 16 (App Router) + React 19 + TypeScript. SSR via Server Components, mutações via Server Actions.
- **Banco:** Postgres (Supabase) via Prisma 7 com driver adapter `@prisma/adapter-pg`.
- **Auth + Realtime:** Supabase (`@supabase/ssr` + `@supabase/supabase-js`).
- **Deploy:** Vercel (Next.js detectado automaticamente, sem `vercel.json`).
- **Sem servidor Express separado.** Não reintroduzir Fly.io, Render, Docker.

## Idioma
- Código, comentários, mensagens de erro, docs e nomes de variáveis em **português**.
- Nomes de campos: camelCase no TS, snake_case no banco via `@map()` no Prisma.

## Convenções Next 16
- `middleware.ts` foi **renomeado** para [proxy.ts](proxy.ts) — função exportada como `proxy`.
- Params de rotas dinâmicas são `Promise`: `{ params: Promise<{ uid: string }> }` → `await params`.
- Prisma 7 não aceita `url` ou `directUrl` no `schema.prisma` — vivem em [prisma.config.ts](prisma.config.ts). PrismaClient é instanciado com `new PrismaPg({ connectionString: process.env.DATABASE_URL })` adapter.

## Padrão de rotas (App Router)
- Páginas em `app/<rota>/page.tsx` são Server Components — fazem auth + query Prisma direto.
- Mutações via Server Actions em `app/<rota>/actions.ts` (`"use server"` no topo).
- Realtime via Client Component `realtime-refresher.tsx` que assina `postgres_changes` e dispara `router.refresh()`.
- Componentes compartilhados em [components/](components/) (ex: [bandeja/](components/bandeja/), [temas/](components/temas/)).

### Auth
- Server: [lib/supabase/server.ts](lib/supabase/server.ts) — `createClient()` async lê cookies via `next/headers`.
- Client: [lib/supabase/client.ts](lib/supabase/client.ts) — `createBrowserClient`.
- Proxy: [lib/supabase/proxy.ts](lib/supabase/proxy.ts) — `updateSession` redireciona anon→`/login?next=`, logado→`/dashboard` em `/login`. Públicas: `/login`, `/auth/callback`.
- **Não chamar `supabase.auth.getUser()` em hot path do client** — já tem proxy + Server Components fazendo isso.

### Server Actions
- Sempre validar auth antes de Prisma (helper `autorizar()` ou `requireUser()` dentro do arquivo).
- **PATCH:** allow-list de campos. Nunca passar input direto pro Prisma.
- **Ownership de filhos** (item, ação): incluir `personagemId: uid` no `where` do `update`/`delete` (defesa em profundidade).
- **revalidatePath** após mutação pra forçar refetch do RSC.
- Para retornar a entidade criada (evitar refetch via realtime), action pode retornar o objeto serializado — ver padrão em [components/bandeja/actions.ts](components/bandeja/actions.ts).

### Prisma
- Singleton em [lib/prisma.ts](lib/prisma.ts) cacheado em `globalThis`. Nunca `new PrismaClient()` em outro lugar — exauriria o pool do PgBouncer.
- Erros comuns: `P2002` → 409 (unique), `P2025` → 404 (não encontrado).

## Schema / Banco
- Schema em [prisma/schema.prisma](prisma/schema.prisma).
- `Personagem.id` é UUID auto-gerado; dono via `Personagem.userId` (referência ao `auth.users.id` do Supabase). `Personagem.mesaId` é nullable.
- Migrations: usar `npm run db:push` (sem pasta `migrations/`).
- Após criar/alterar tabela, rodar no SQL Editor do Supabase: `ALTER TABLE <t> REPLICA IDENTITY FULL` e publicar a tabela em Realtime (instruções no topo do schema).

## Temas + anti-flash
- Presets + custom em [lib/themes.ts](lib/themes.ts).
- Script anti-flash em [app/theme-script.tsx](app/theme-script.tsx) — espelho dos presets, injetado no `<body>` antes do primeiro render. Se mudar um preset em `lib/themes.ts`, atualizar este também.

## Performance — patterns a manter
- SSR via Server Component faz 1 query Prisma por página, sem fetch HTTP intermediário.
- Mutações via Server Action — 1 round-trip cliente → servidor, sem REST.
- Action que retorna a entidade criada permite **append local** no cliente, evitando double-fetch via realtime (ver chat em [components/bandeja/](components/bandeja/)).
- Realtime listener **filtra eventos do próprio `uid`** quando o schema tem campo identificador (ex: `mensagens.uid`).
- Lazy-create de calendário tolera `P2002` (race com outra request).
- `Promise.all` em Server Action quando há queries independentes (ex: criar mensagem + atualizar `ultimaRolagem` no personagem).

## Não fazer
- Não recriar `legacy/`, `backend/`, `fly.toml`, `Dockerfile`, `render.yaml`.
- Não criar `app/api/*` route handlers — toda I/O passa por Server Actions ou queries SSR.
- Não commitar `.env*` (gitignored).
- Não passar input direto pro Prisma em PATCH — sempre allow-list.
- Não criar `new PrismaClient()` fora de [lib/prisma.ts](lib/prisma.ts).
- Não chamar `supabase.auth.getUser()` em loop / hot path do cliente.
- Não pollar REST — usar realtime + `router.refresh()` ou append local.
- Não criar arquivos `*.md` ou `README` em rota nova sem pedido explícito.
