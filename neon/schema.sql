create table if not exists public.app_config (
  app_id text primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);
