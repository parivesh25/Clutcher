-- ABC starter kit: database setup.
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- It is safe to run twice. (I could not test it against a live Supabase project, so run it tonight.)

-- 1. Profiles: one row per user, holds the role ('user' or 'admin').
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Create a profile automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger helpers are internal database code, not public RPC endpoints.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Users who signed up before this script ran:
insert into public.profiles (id, email)
  select id, email from auth.users on conflict do nothing;

-- 2. Records: the generic "thing" your app manages.
--    Rename to cases / complaints / expenses / shipments once you know the problem.
create table if not exists public.records (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  body       text not null default '',
  category   text not null default 'general',
  status     text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  ai_summary text,
  created_at timestamptz not null default now()
);
create index if not exists records_owner_idx on public.records (owner, created_at desc);

-- 3. Audit log: the hash chain. 'ts' is text on purpose: it is the exact string that was hashed.
--    prev_hash is UNIQUE so two entries can never claim the same parent (no forks).
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor      text not null,
  action     text not null,
  entity     text not null,
  entity_id  text not null,
  payload    jsonb not null default '{}'::jsonb,
  prev_hash  text not null unique,
  hash       text not null,
  ts         text not null,
  created_at timestamptz not null default now()
);

-- 4. Row Level Security (RLS): ON, with NO policies.
--    That means the browser (anon / signed-in keys) can read and write NOTHING in these tables.
--    Only the Flask backend, using the service key, can. All data goes through Flask.
alter table public.profiles  enable row level security;
alter table public.records   enable row level security;
alter table public.audit_log enable row level security;

-- 4b. PS-61 Internship and Hackathon Matcher tables.
create table if not exists public.skills (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}'
);

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  skill_ids text[] not null default '{}',
  country_code text,
  study_level text check (study_level is null or study_level in ('school', 'undergraduate', 'postgraduate', 'other')),
  graduation_year integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  organization text,
  opportunity_type text not null check (opportunity_type in ('internship', 'hackathon')),
  description text not null default '',
  source_name text not null,
  source_url text not null,
  source_external_id text,
  application_deadline_at timestamptz,
  application_deadline_date date,
  deadline_timezone text,
  deadline_text text,
  theme_tags text[] not null default '{}',
  eligibility jsonb not null default '{}'::jsonb,
  source_status text not null default 'open' check (source_status in ('open', 'closed', 'unknown')),
  review_status text not null default 'approved' check (review_status in ('approved', 'needs_review')),
  last_checked_at timestamptz not null default now(),
  content_hash text,
  created_at timestamptz not null default now(),
  unique (source_name, source_url)
);

create table if not exists public.opportunity_skills (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  skill_id text not null references public.skills(id),
  skill_type text not null check (skill_type in ('required', 'preferred')),
  primary key (opportunity_id, skill_id)
);
create index if not exists opportunity_skills_skill_id_idx on public.opportunity_skills (skill_id);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  error_message text
);

alter table public.skills enable row level security;
alter table public.student_profiles enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_skills enable row level security;
alter table public.ingestion_runs enable row level security;

-- Supabase's RLS event-trigger helper must not be exposed through the Data API.
-- The conditional block keeps this setup script portable if that helper is absent.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

insert into public.skills (id, name, aliases) values
  ('python', 'Python', array['py']),
  ('javascript', 'JavaScript', array['js']),
  ('typescript', 'TypeScript', array['ts']),
  ('react', 'React', array['reactjs']),
  ('flask', 'Flask', array[]::text[]),
  ('sql', 'SQL', array['postgresql', 'postgres'])
on conflict (id) do nothing;

-- 4b. Personal skill knowledge graph (additive; safe to run on an existing project).
--     Stores only each user's own skill states. The graph itself stays in the backend
--     (backend/knowledge_graph/data/skill-graph.json), so it is never copied per user.
create table if not exists public.skill_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null check (skill_id ~ '^[a-z][a-z0-9_]*$'),
  state text not null check (state in ('base', 'learned')),
  source text not null default 'profile_tag' check (source in ('profile_tag', 'resume', 'learning')),
  learned_at timestamptz,
  position_x double precision check (position_x is null or position_x between 0 and 1),
  position_y double precision check (position_y is null or position_y between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
alter table public.skill_progress enable row level security;
-- The backend uses the service key; these policies let a signed-in user read and change only their own rows.
drop policy if exists "skill_progress own rows" on public.skill_progress;
create policy "skill_progress own rows" on public.skill_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. Make yourself admin (admins see everyone's records). Replace the email, then run:
--    update public.profiles set role = 'admin' where email = 'you@example.com';

-- 6. OPTIONAL: make the audit log append-only (nobody can edit or delete rows, even by mistake).
--    Skip this if you want to demo tampering by editing a row in the Table Editor.
-- create or replace function public.block_audit_changes() returns trigger language plpgsql as $$
-- begin raise exception 'audit_log is append-only'; end; $$;
-- create trigger audit_no_update before update or delete on public.audit_log
--   for each row execute function public.block_audit_changes();

