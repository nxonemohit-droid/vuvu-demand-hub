alter table public.leads
  add column if not exists draft_whatsapp text,
  add column if not exists ai_score integer,
  add column if not exists ai_reason text;

create index if not exists vl_leads_ai_score_idx on public.leads (ai_score desc nulls last);