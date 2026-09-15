# Pontual RH Super

Plataforma corporativa de gestão de pessoas para **RH**, **Gestores** e **Colaboradores**: gestão de equipes, controle de férias, quadro de horários com controle de ponto e requisições com upload de documentos (atestados).

React + Vite + TypeScript + Tailwind CSS, com **Supabase** como backend (Postgres + Auth + Storage + RLS).

## Rodando

```bash
cd app
npm install
cp .env.example .env.local   # opcional: configure o Supabase
npm run dev                  # http://127.0.0.1:5173
npm run build && npm run typecheck
```

Sem `.env.local`, o app roda em **modo demonstração** (dados em `localStorage`, totalmente funcional).

## Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) — tabelas, enums, RLS policies, bucket de storage e trigger de signup.
3. Em **Project Settings → API**, copie URL e anon key para `app/.env.local`:

   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-anon-key
   ```

4. Reinicie o dev server. O cliente Supabase é inicializado automaticamente.

> **Segurança:** apenas a anon key vai para o frontend — por design ela é pública. Toda autorização é forçada por **Row Level Security**: `rh` vê tudo, `gestor` vê só liderados diretos (função SQL `can_manage`), `colaborador` vê só o próprio. Anexos vão para o bucket privado `request-docs` (máx. 10 MB; PDF/PNG/JPG/WEBP), e requisições de atestado **exigem** documento anexado.

## Módulos

| Módulo | RH | Gestor | Colaborador |
| ------ | -- | ------ | ----------- |
| **Painel** — indicadores, tarefas e aprovações | ✔ | ✔ | ✔ |
| **Equipes** — diretório, quadro de horários editável, saldos de férias, status de ponto | ✔ | (liderados) | — |
| **Férias** — saldo, solicitação de período, aprovação/reprovação, saldos por pessoa | ✔ | ✔ | (próprias) |
| **Ponto** — relógio de batidas (entrada/almoço/volta/saída), resumo 7 dias, visão da equipe em tempo real, estorno de batida | ✔ | ✔ | (próprio) |
| **Requisições** — documentos e justificativas com anexos, aprovação | ✔ | ✔ | criar/próprias |
| **Vagas** — recrutamento | ✔ | — | — |
| **Desenvolvimento** — PDIs e feedbacks | — | — | ✔ |

### Quadro de horários
Cada colaborador tem jornada semanal (ex.: `seg–sex 09:00–18:00`). RH e o gestor direto editam o quadro na tela Equipes; o painel Ponto compara as batidas com a jornada e marca saldo/defasagem por dia.

### Requisições com documentos
Colaborador envia tipo (atestado, férias, folga, home office), período, justificativa e anexos. Atestados exigem PDF/imagem anexada. Gestores e RH veem os anexos e aprovam/reprovam.

## Acesso de demonstração

Senha única: `pulsar123`

- **RH:** `marina.costa@pontual.com`
- **Gestor:** `rafael.almeida@pontual.com`
- **Colaborador:** `beatriz.lima@pontual.com`

Em produção, o login é substituído por **Supabase Auth** (`signInWithPassword`); o trigger `on_auth_user_created` cria o perfil automaticamente.

## Segurança

- Sem `dangerouslySetInnerHTML`/`eval` — todo texto dinâmico passa pelo escape do React.
- Validação de MIME e tamanho nos anexos (client + constraint no schema).
- Sessão validada ao ler do `localStorage`; dados corrompidos caem no padrão.
- Autorização por papel no roteamento **e** no banco (RLS) — o frontend nunca é a única barreira.

## Estrutura

```
app/
├── public/                # logo.svg, logo-icon.svg, illustration.svg, pattern.svg
├── supabase/schema.sql    # schema completo com RLS, storage e triggers
├── .env.example           # template de configuração Supabase
└── src/
    ├── components/        # Layout, ui.tsx, TaskList
    ├── data/seed.ts       # dados de demonstração
    ├── lib/               # auth, store, supabase, format
    ├── pages/             # Login, Dashboard, Team, Vacations, Timesheet,
    │                      # Requests, Vacancies, Development
    └── types.ts           # tipos de domínio
```
