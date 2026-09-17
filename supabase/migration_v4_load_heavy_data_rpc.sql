-- ============================================================
-- RPC load_heavy_data: agrupa as 12 consultas de dados pesados
-- em uma única viagem de rede (jsonb por tabela).
-- Aplicar no SQL Editor do Supabase:
--   select * from load_heavy_data();
-- Requer: permissões SELECT nas tabelas (RLS aplica-se normalmente,
-- SECURITY INVOKER). Executada apenas por usuários autenticados.
-- ============================================================
CREATE OR REPLACE FUNCTION public.load_heavy_data()
RETURNS TABLE (
  pdis jsonb,
  feedbacks jsonb,
  vacancies jsonb,
  requests jsonb,
  request_attachments jsonb,
  vacations jsonb,
  time_entries jsonb,
  tasks jsonb,
  payrolls jsonb,
  hour_bank jsonb,
  vacation_history jsonb,
  day_offs jsonb
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    COALESCE((SELECT jsonb_agg(t ORDER BY t.id) FROM public.pdis t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.feedbacks t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.opened_at DESC) FROM public.vacancies t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.requests t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t) FROM public.request_attachments t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.vacation_requests t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.occurred_at DESC) FROM public.time_entries t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at) FROM public.tasks t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t) FROM public.payrolls t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.hour_bank t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.period_start DESC) FROM public.vacation_history t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.day DESC) FROM public.day_off_requests t), '[]'::jsonb);
$$;

GRANT EXECUTE ON FUNCTION public.load_heavy_data() TO authenticated;
