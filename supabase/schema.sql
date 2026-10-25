-- Sheeperks 账号档案表。在 Supabase 后台 SQL Editor 里整段运行一次。
-- 登录账号本身在 auth.users（Supabase 自带），这里只存用户自己填的档案。

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  nickname     text not null check (char_length(nickname) between 1 and 20),
  city         text check (char_length(city) <= 20),
  school       text check (char_length(school) <= 60),
  stage        text check (char_length(stage) <= 20),
  grad_year    int  check (grad_year between 2020 and 2040),
  interests    text[] not null default '{}' check (cardinality(interests) <= 12),
  email_opt_in boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 行级权限：每个人只能读写自己的那一行
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
create policy "read own profile"   on public.profiles for select using (auth.uid() = id);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.touch_profile() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_profile();

-- 用户在档案页点「删除账号」：删掉 auth.users 里自己那条，profiles 跟着级联删除
create or replace function public.delete_me() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
