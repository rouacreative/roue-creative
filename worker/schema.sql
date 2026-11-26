-- Neon (Postgres). Auth and permissions are enforced in the Cloudflare Worker API, not in the database.
create table users(id uuid primary key default gen_random_uuid(), name text not null, email text unique not null, password_hash text not null, stage text, is_admin bool default false, must_change bool default true, active bool default true, created_at timestamptz default now());
create table sessions(token_hash text primary key, user_id uuid references users on delete cascade, expires_at timestamptz not null);
create table videos(id uuid primary key default gen_random_uuid(), title text not null, created_at timestamptz default now());
-- times are stored as Cairo local time (timestamp without time zone)
create table tasks(id uuid primary key default gen_random_uuid(), video_id uuid references videos on delete cascade, stage text not null, assignee uuid references users on delete set null,
  start_at timestamp, due_at timestamp, completed_at timestamp, status text default 'todo' check (status in ('todo','doing','done')), note text,
  rating smallint check (rating between 1 and 5), rating_note text, deadline_notified bool default false);
create table push_subscriptions(endpoint text primary key, user_id uuid references users on delete cascade, p256dh text, auth text, created_at timestamptz default now());
create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid references users on delete cascade, title text, body text, url text, read bool default false, created_at timestamptz default now());
create table login_attempts(k text not null, at timestamptz default now());
create index on login_attempts(k, at);
create index on tasks(assignee);
create index on tasks(video_id);
create index on notifications(user_id) where read=false;
create index on sessions(expires_at);
create table stages(id text primary key, name text not null, position int not null);
insert into stages(id,name,position) values ('idea','الأفكار والسكريبت',1),('design','التصميم والستوري بورد',2),('gen','التوليد',3),('edit','المونتاج والصوت',4),('review','المراجعة والتسليم',5);
create table settings(k text primary key, v text not null);
-- public-site content managed from the admin page
create table media(id uuid primary key default gen_random_uuid(), name text, mime text not null, data bytea not null, size int, created_at timestamptz default now());
create table site_items(id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('work','series','episode','package','member')), title text not null, sub text default '', cat text default '', image text default '', yt text default '', extra jsonb not null default '{}', position int not null default 0, published bool default true, created_at timestamptz default now());
create index on site_items(kind, position);
create table inbox(id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('request','subscribe')), data jsonb not null, handled bool default false, created_at timestamptz default now());

alter table users add column if not exists claimable bool default false;

alter table site_items drop constraint if exists site_items_kind_check;
alter table site_items add constraint site_items_kind_check check (kind in ('work','series','episode','package','member','reel'));

create table if not exists posts(id uuid primary key default gen_random_uuid(), group_id text not null, user_id uuid references users on delete set null, platform text not null check (platform in ('fb','ig')), mode text not null default 'test' check (mode in ('test','live')), status text not null default 'queued', video_url text not null, caption text default '', remote_id text, error text, meta jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
create index if not exists posts_group on posts(group_id);
