-- ============================================================
-- migration_v8: PDI avançado — progresso por etapa (%), comentários
-- do gestor e metas (perguntas de acompanhamento respondidas pelo
-- colaborador: sim/não ou escolha entre opções).
--
-- As etapas, comentários e perguntas de meta vivem em colunas jsonb
-- dentro de `pdis` (mesma estratégia das etapas da v7) — sem tabelas
-- novas, sem quebra de RLS. Idempotente (IF NOT EXISTS).
--
-- Aplicar no SQL Editor do Supabase.
-- ============================================================

-- 1. Comentários do gestor (incentivo/orientação) -----------------------
alter table public.pdis add column if not exists manager_comments jsonb not null default '[]'::jsonb;

-- 2. Metas: flag + perguntas (com resposta do colaborador embutida) -----
alter table public.pdis add column if not exists goals_enabled boolean not null default false;
alter table public.pdis add column if not exists goal_questions jsonb not null default '[]'::jsonb;

-- 3. RPC load_heavy_data: incluir as colunas novas -----------------------
-- (o to_jsonb(p) já as traz automaticamente — nenhuma mudança necessária
-- na função, pois ela agrega a linha inteira com to_jsonb)

-- Nota: `steps` (v7) já é jsonb; o progresso por etapa (% em `progress`
-- dentro de cada item) também viaja dentro dele, sem coluna extra.
