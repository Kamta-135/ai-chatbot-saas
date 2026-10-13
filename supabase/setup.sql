-- =====================================================================================
-- Naye Supabase project ke liye poora setup (Supabase Dashboard > SQL Editor > New query > paste > Run)
-- Embedding size 1536 (health check se confirm hua). Dobara chalane par bhi koi nuksaan nahi (IF NOT EXISTS).
-- =====================================================================================

-- 1) Vector search ka extension
create extension if not exists vector with schema extensions;

-- 2) Documents (RAG): har row = ek document ka ek chhota hissa (chunk) + uska embedding
create table if not exists public.documents (
  id          bigint generated always as identity primary key,
  content     text not null,
  embedding   vector(1536),
  metadata    jsonb not null default '{}'::jsonb,   -- fileName, originalName, session_id, chunkIndex, totalChunks
  created_at  timestamptz not null default now()
);
create index if not exists documents_metadata_idx   on public.documents using gin (metadata);
create index if not exists documents_created_at_idx on public.documents (created_at desc);
create index if not exists documents_embedding_idx  on public.documents using hnsw (embedding vector_cosine_ops);

-- 3) Semantic search function (app isi ko rpc("match_documents") se bulata hai)
create or replace function public.match_documents (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (id bigint, content text, metadata jsonb, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select d.id, d.content, d.metadata, 1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) > match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- 4) Chat history
create table if not exists public.chat_history (
  id          bigint generated always as identity primary key,
  session_id  text,
  role        text not null,
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_history_session_idx on public.chat_history (session_id, created_at);

-- 5) Security: tables par RLS on (bina policy ke sirf server ki service_role key chalti hai, anon key nahi)
alter table public.documents    enable row level security;
alter table public.chat_history enable row level security;

-- 6) Original files ka backup bucket (private)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
