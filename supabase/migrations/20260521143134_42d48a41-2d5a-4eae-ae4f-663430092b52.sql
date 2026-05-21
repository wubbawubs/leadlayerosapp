create table public.project_docs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'planning',
  content text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_docs enable row level security;

create policy "project_docs authenticated read"
  on public.project_docs for select
  to authenticated
  using (true);

create trigger project_docs_set_updated_at
  before update on public.project_docs
  for each row execute function public.set_updated_at();

create index project_docs_category_idx on public.project_docs(category);