-- Sheeperks 羊毛牧场：积分（羊毛）、等级、签到、任务、小羊赏金、成就、小游戏、小羊商店。
-- 在 Supabase 后台 SQL Editor 里整段运行（先跑过 schema.sql）。可以重复运行：表用 if not exists，函数用 create or replace，任务/成就用 upsert。
--
-- 原则：
--   1. 前端不能直接写任何发分的表，只能调下面这些 security definer 函数，函数里按规则算分、限次。
--   2. 所有发分写进 wool_ledger，(user_id, kind, ref) 唯一，同一件事重复调用不会重复发。
--   3. 「一天」按英国时间算（Europe/London），每周从周一开始。
--   4. 羊毛只能做任务、签到、玩游戏获得，不能买、不能换现金，不做拉人头、不收押金。
--   5. 兑换礼品时扣羊毛，订单取消自动退回；等级按累计获得算，兑换不掉级。
--
-- 后台审核赏金：Table Editor → quest_submissions，把 status 改成 approved（发羊毛）或 rejected（可在 note 写原因）。
-- 后台处理兑换：Table Editor → shop_orders，pending → ready（备好货 / 发了券码，note 里写怎么领）→ done；改成 cancelled 自动退回羊毛。
-- 上架礼品：Table Editor → shop_items，status 改成 on 才能兑换（soon = 只展示「即将上架」，off = 隐藏）。

-- ---------- 表 ----------
create table if not exists public.quests (
  code       text primary key,
  kind       text not null check (kind in ('newbie', 'daily', 'weekly', 'bounty')),
  title      text not null,
  body       text not null default '',
  reward     int  not null check (reward between 0 and 500),
  action     text,                      -- 进度来自哪个行为：checkin / game / quiz / view_weekly / profile / email / bounty …；bounty 类为空
  goal       int  not null default 1,
  min_level  int  not null default 1,   -- 悬赏建议 2 级起，挡掉刚注册的小号
  slots      int,                       -- 悬赏名额，空 = 不限
  tag        text,                      -- 悬赏标签：核实 / 拍券 / 实测
  link       text,                      -- 去哪里做
  starts_at  timestamptz,
  ends_at    timestamptz,
  active     boolean not null default true,
  sort       int not null default 0
);

create table if not exists public.badges (
  code   text primary key,
  title  text not null,
  body   text not null,
  reward int  not null default 0,
  sort   int  not null default 0
);

create table if not exists public.wool_ledger (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  delta      int  not null,
  kind       text not null,             -- checkin / quest / badge / game / bounty / admin
  ref        text not null,             -- 去重键，比如 checkin 的日期、quest 的 code:周期
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists wool_ledger_user on public.wool_ledger (user_id, created_at desc);

create table if not exists public.checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  streak  int  not null,
  reward  int  not null,
  primary key (user_id, day)
);

create table if not exists public.user_actions (
  user_id uuid not null references auth.users (id) on delete cascade,
  action  text not null,
  day     date not null,
  n       int  not null default 0,
  primary key (user_id, action, day)
);

create table if not exists public.user_badges (
  user_id   uuid not null references auth.users (id) on delete cascade,
  code      text not null references public.badges (code) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);

create table if not exists public.quest_submissions (
  id          bigserial primary key,
  quest       text not null references public.quests (code) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null check (char_length(content) between 4 and 500),
  link        text check (char_length(link) <= 300),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note        text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (quest, user_id)
);

create table if not exists public.game_plays (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  game       text not null,
  score      int  not null,
  reward     int  not null,
  day        date not null,
  created_at timestamptz not null default now()
);
create index if not exists game_plays_user_day on public.game_plays (user_id, day);

-- 小羊赏金分类：field 实地任务（核实 / 拍券 / 实测）、freebie 商家免费赠品、survey 问卷、poll 投票。后三类先留板块。
alter table public.quests add column if not exists cat text not null default 'field';
do $$ begin
  alter table public.quests add constraint quests_cat_check check (cat in ('field', 'freebie', 'survey', 'poll'));
exception when duplicate_object then null; end $$;

-- 小羊商店
create table if not exists public.shop_items (
  code      text primary key,
  title     text not null,
  body      text not null default '',
  cost      int  not null check (cost > 0),
  cat       text not null default 'merch' check (cat in ('merch', 'coupon', 'digital')),
  image     text,                         -- 网站上的图片路径，比如 assets/shop/tote.jpg
  stock     int,                          -- 总库存，空 = 不限
  per_user  int  not null default 1,      -- 每人最多兑换几次
  min_level int  not null default 1,
  ship      text not null default 'meet' check (ship in ('meet', 'post', 'online')),  -- 格拉斯哥面交 / 邮寄 / 线上发券码
  status    text not null default 'soon' check (status in ('on', 'soon', 'off')),
  ends_at   timestamptz,
  sort      int  not null default 0
);

create table if not exists public.shop_orders (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  item       text not null references public.shop_items (code),
  cost       int  not null,
  contact    text check (char_length(contact) <= 200),   -- 用户留的联系方式（微信号 / 邮箱），只给管理员看
  status     text not null default 'pending' check (status in ('pending', 'ready', 'done', 'cancelled')),
  note       text,                                        -- 管理员写给用户的：取货时间地点、券码等
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_orders_user on public.shop_orders (user_id, created_at desc);
create index if not exists shop_orders_item on public.shop_orders (item) where status <> 'cancelled';

-- ---------- 权限：自己的数据只读，写入只走函数 ----------
alter table public.quests enable row level security;
alter table public.badges enable row level security;
alter table public.wool_ledger enable row level security;
alter table public.checkins enable row level security;
alter table public.user_actions enable row level security;
alter table public.user_badges enable row level security;
alter table public.quest_submissions enable row level security;
alter table public.game_plays enable row level security;
alter table public.shop_items enable row level security;
alter table public.shop_orders enable row level security;

revoke all on public.quests, public.badges, public.wool_ledger, public.checkins, public.user_actions,
              public.user_badges, public.quest_submissions, public.game_plays, public.shop_items, public.shop_orders from anon, authenticated;
grant select on public.quests, public.badges, public.shop_items to anon, authenticated;
grant select on public.wool_ledger, public.checkins, public.user_actions, public.user_badges,
                public.quest_submissions, public.game_plays, public.shop_orders to authenticated;

drop policy if exists "quests readable" on public.quests;
drop policy if exists "badges readable" on public.badges;
create policy "quests readable" on public.quests for select using (active);
create policy "badges readable" on public.badges for select using (true);
drop policy if exists "shop readable" on public.shop_items;
create policy "shop readable" on public.shop_items for select using (status <> 'off');
do $$ declare t text; begin
  foreach t in array array['wool_ledger', 'checkins', 'user_actions', 'user_badges', 'quest_submissions', 'game_plays', 'shop_orders'] loop
    execute format('drop policy if exists "read own" on public.%I', t);
    execute format('create policy "read own" on public.%I for select using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------- 小工具 ----------
create or replace function public.uk_today() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/London')::date;
$$;

-- 等级按累计获得的羊毛算（兑换花掉也不掉级；订单取消退回的不算新获得）。门槛和前端 hub.js 的 LEVELS 保持一致。
create or replace function public.wool_level(earned int) returns int language sql immutable set search_path = '' as $$
  select case when earned >= 2000 then 6 when earned >= 900 then 5 when earned >= 400 then 4
              when earned >= 150 then 3 when earned >= 50 then 2 else 1 end;
$$;

create or replace function public._earned(uid uuid) returns int language sql stable set search_path = '' as $$
  select coalesce(sum(delta) filter (where delta > 0 and kind <> 'refund'), 0)::int from public.wool_ledger where user_id = uid;
$$;

create or replace function public._give(uid uuid, amount int, k text, r text, n text) returns boolean
language plpgsql set search_path = '' as $$
begin
  insert into public.wool_ledger (user_id, delta, kind, ref, note) values (uid, amount, k, r, n)
  on conflict (user_id, kind, ref) do nothing;
  return found;
end $$;

create or replace function public._bump(uid uuid, a text, k int default 1) returns void
language sql set search_path = '' as $$
  insert into public.user_actions (user_id, action, day, n) values (uid, a, public.uk_today(), k)
  on conflict (user_id, action, day) do update set n = public.user_actions.n + excluded.n;
$$;

-- 档案完整度 0–6：昵称（有档案就有）、城市、学校、阶段、毕业年份、关心类别
create or replace function public._profile_score(uid uuid) returns int language sql stable set search_path = '' as $$
  select coalesce((select 1 + (city is not null)::int + (school is not null)::int + (stage is not null)::int
                         + (grad_year is not null)::int + (cardinality(interests) > 0)::int
                   from public.profiles where id = uid), 0);
$$;

-- 任务进度：daily 看今天、weekly 看本周、newbie 看全部
create or replace function public._progress(uid uuid, q public.quests) returns int
language plpgsql stable set search_path = '' as $$
declare today date := public.uk_today(); since date;
begin
  if q.action = 'profile' then
    return public._profile_score(uid);
  elsif q.action = 'email' then
    return coalesce((select email_opt_in::int from public.profiles where id = uid), 0);
  end if;
  since := case q.kind when 'daily' then today when 'weekly' then date_trunc('week', today)::date else date '2000-01-01' end;
  return coalesce((select sum(n) from public.user_actions where user_id = uid and action = q.action and day >= since), 0);
end $$;

create or replace function public._period(q public.quests) returns text language sql stable set search_path = '' as $$
  select case q.kind when 'daily' then public.uk_today()::text
                     when 'weekly' then to_char(public.uk_today(), 'IYYY-"W"IW') else 'once' end;
$$;

-- 成就：每次发分后检查一遍，新拿到的成就顺带发奖励。返回新解锁的成就 code。
create or replace function public._badges(uid uuid) returns text[]
language plpgsql set search_path = '' as $$
declare got text[] := '{}'; b record; ok boolean; earned int; best int;
begin
  earned := public._earned(uid);
  for b in select * from public.badges where code not in (select code from public.user_badges where user_id = uid) order by sort loop
    ok := case b.code
      when 'hello'      then true
      when 'profile'    then public._profile_score(uid) >= 6
      when 'streak7'    then exists (select 1 from public.checkins where user_id = uid and streak >= 7)
      when 'streak30'   then exists (select 1 from public.checkins where user_id = uid and streak >= 30)
      when 'gamer10'    then (select count(*) from public.game_plays where user_id = uid) >= 10
      when 'jump1000'   then exists (select 1 from public.game_plays where user_id = uid and game = 'jump' and score >= 1000)
      when 'memory'     then exists (select 1 from public.game_plays where user_id = uid and game = 'memory' and score >= 3)
      when 'quiz'       then (select count(*) from public.user_actions where user_id = uid and action = 'quiz' and n >= 3) >= 5
      when 'bounty1'    then exists (select 1 from public.quest_submissions where user_id = uid and status = 'approved')
      when 'bounty5'    then (select count(*) from public.quest_submissions where user_id = uid and status = 'approved') >= 5
      when 'lv3'        then public.wool_level(earned) >= 3
      when 'lv5'        then public.wool_level(earned) >= 5
      else false end;
    if ok then
      insert into public.user_badges (user_id, code) values (uid, b.code) on conflict do nothing;
      if b.reward > 0 then perform public._give(uid, b.reward, 'badge', b.code, '成就：' || b.title); end if;
      got := got || b.code;
    end if;
  end loop;
  return got;
end $$;

-- ---------- 给前端调的函数 ----------

-- 个人中心一次拿全：余额、累计、签到、任务进度、成就、账本、悬赏提交、今天游戏收益
create or replace function public.hub_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := public.uk_today();
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public._badges(uid);   -- 老用户第一次打开时补发「初来乍到」等
  return jsonb_build_object(
    'today', today,
    'balance', coalesce((select sum(delta) from public.wool_ledger where user_id = uid), 0),
    'earned', public._earned(uid),
    'week', coalesce((select sum(delta) from public.wool_ledger where user_id = uid and delta > 0 and kind <> 'refund'
                      and (created_at at time zone 'Europe/London')::date >= date_trunc('week', today)::date), 0),
    'streak', coalesce((select streak from public.checkins where user_id = uid and day >= today - 1 order by day desc limit 1), 0),
    'checked', exists (select 1 from public.checkins where user_id = uid and day = today),
    'checkins', coalesce((select jsonb_agg(day order by day) from public.checkins where user_id = uid and day > today - 35), '[]'),
    'quests', coalesce((select jsonb_agg(jsonb_build_object(
        'code', q.code, 'kind', q.kind, 'title', q.title, 'body', q.body, 'reward', q.reward, 'goal', q.goal,
        'min_level', q.min_level, 'tag', q.tag, 'cat', q.cat, 'link', q.link, 'ends_at', q.ends_at,
        'left', case when q.slots is null then null else q.slots - (select count(*) from public.quest_submissions s where s.quest = q.code and s.status <> 'rejected') end,
        'slots', q.slots,
        'progress', case when q.kind = 'bounty' then null else least(public._progress(uid, q), q.goal) end,
        'claimed', exists (select 1 from public.wool_ledger l where l.user_id = uid and l.kind = 'quest' and l.ref = q.code || ':' || public._period(q)),
        'submission', (select jsonb_build_object('status', s.status, 'note', s.note, 'content', s.content, 'at', s.created_at)
                       from public.quest_submissions s where s.quest = q.code and s.user_id = uid)
      ) order by q.sort, q.code)
      from public.quests q where q.active and (q.starts_at is null or q.starts_at <= now())
        and (q.ends_at is null or q.ends_at > now() or exists (select 1 from public.quest_submissions s where s.quest = q.code and s.user_id = uid))), '[]'),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'at', earned_at)) from public.user_badges where user_id = uid), '[]'),
    'ledger', coalesce((select jsonb_agg(x) from (select delta, kind, note, created_at from public.wool_ledger
                        where user_id = uid order by created_at desc, id desc limit 40) x), '[]'),
    'game_today', coalesce((select sum(reward) from public.game_plays where user_id = uid and day = today), 0),
    'shop', coalesce((select jsonb_agg(jsonb_build_object(
        'code', i.code, 'title', i.title, 'body', i.body, 'cost', i.cost, 'cat', i.cat, 'image', i.image, 'ship', i.ship,
        'status', i.status, 'min_level', i.min_level, 'per_user', i.per_user, 'ends_at', i.ends_at, 'stock', i.stock,
        'left', case when i.stock is null then null else i.stock - (select count(*) from public.shop_orders o where o.item = i.code and o.status <> 'cancelled') end,
        'mine', (select count(*) from public.shop_orders o where o.item = i.code and o.user_id = uid and o.status <> 'cancelled')
      ) order by i.status = 'soon', i.sort, i.cost) from public.shop_items i where i.status <> 'off'), '[]'),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'item', o.item, 'title', i.title, 'image', i.image, 'cost', o.cost,
        'status', o.status, 'note', o.note, 'contact', o.contact, 'at', o.created_at) order by o.created_at desc)
      from public.shop_orders o join public.shop_items i on i.code = o.item where o.user_id = uid), '[]')
  );
end $$;

-- 签到：连续第 1–7 天分别 2/2/3/3/4/4/10，第 8 天起重新从 2 开始一轮；断签从第 1 天算
create or replace function public.check_in() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := public.uk_today(); s int; r int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.checkins where user_id = uid and day = today) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  s := coalesce((select streak from public.checkins where user_id = uid and day = today - 1), 0) + 1;
  r := (array[2, 2, 3, 3, 4, 4, 10])[((s - 1) % 7) + 1];
  insert into public.checkins (user_id, day, streak, reward) values (uid, today, s, r);
  perform public._give(uid, r, 'checkin', today::text, '连续签到第 ' || s || ' 天');
  perform public._bump(uid, 'checkin');
  return jsonb_build_object('ok', true, 'streak', s, 'reward', r, 'badges', public._badges(uid));
end $$;

-- 记录浏览类行为（只认白名单，每天每种最多记 5 次）
create or replace function public.track(a text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or a not in ('view_weekly', 'view_budget', 'view_bf', 'view_earn', 'view_bicester') then return; end if;
  if coalesce((select n from public.user_actions where user_id = uid and action = a and day = public.uk_today()), 0) >= 5 then return; end if;
  perform public._bump(uid, a);
end $$;

-- 领取任务奖励：进度够了才发，每个周期只能领一次
create or replace function public.claim_quest(c text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); q public.quests;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into q from public.quests where code = c and active and kind <> 'bounty';
  if q.code is null then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  if public._progress(uid, q) < q.goal then return jsonb_build_object('ok', false, 'reason', 'progress'); end if;
  if not public._give(uid, q.reward, 'quest', q.code || ':' || public._period(q), q.title) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  return jsonb_build_object('ok', true, 'reward', q.reward, 'badges', public._badges(uid));
end $$;

-- 提交悬赏：等级够、名额没满、没过期，每个悬赏每人一次（被驳回可以改了重交）
create or replace function public.submit_bounty(c text, content text, link text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); q public.quests; used int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into q from public.quests where code = c and active and kind = 'bounty';
  if q.code is null or (q.ends_at is not null and q.ends_at < now()) then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if public.wool_level(public._earned(uid)) < q.min_level then return jsonb_build_object('ok', false, 'reason', 'level'); end if;
  if char_length(trim(content)) < 4 then return jsonb_build_object('ok', false, 'reason', 'short'); end if;
  if exists (select 1 from public.quest_submissions where quest = c and user_id = uid and status <> 'rejected') then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  select count(*) into used from public.quest_submissions where quest = c and status <> 'rejected';
  if q.slots is not null and used >= q.slots then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  insert into public.quest_submissions (quest, user_id, content, link) values (c, uid, left(trim(content), 500), nullif(left(trim(link), 300), ''))
  on conflict (quest, user_id) do update set content = excluded.content, link = excluded.link, status = 'pending',
    note = null, created_at = now(), reviewed_at = null;
  return jsonb_build_object('ok', true);
end $$;

-- 小游戏结算：分数换羊毛的规则在这里，每天游戏羊毛上限 10，每天最多记 30 局
create or replace function public.game_finish(g text, score int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := public.uk_today(); got int; plays int; r int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if g not in ('jump', 'memory', 'quiz') or score < 0 or score > 100000 then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  select count(*), coalesce(sum(reward), 0) into plays, got from public.game_plays where user_id = uid and day = today;
  if plays >= 30 then return jsonb_build_object('ok', false, 'reason', 'plays'); end if;
  if g = 'quiz' and exists (select 1 from public.game_plays where user_id = uid and day = today and game = 'quiz') then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  r := case g when 'jump' then least(score / 300, 4)              -- 每 300 分 1 羊毛，单局最多 4
              when 'memory' then least(greatest(score, 0), 3)     -- 前端按步数给 1–3 星
              else least(score, 3) end;                           -- 问答：答对几题给几个
  r := greatest(least(r, 10 - got), 0);
  insert into public.game_plays (user_id, game, score, reward, day) values (uid, g, score, r, today);
  if r > 0 then
    perform public._give(uid, r, 'game', currval(pg_get_serial_sequence('public.game_plays', 'id'))::text,
      case g when 'jump' then '小羊跳跳 ' || score || ' 分' when 'memory' then '品牌翻翻乐 ' || score || ' 星' else '今日羊毛问答 答对 ' || score || ' 题' end);
  end if;
  perform public._bump(uid, 'game');
  if g = 'quiz' then perform public._bump(uid, 'quiz', score); end if;
  return jsonb_build_object('ok', true, 'reward', r, 'today', got + r, 'cap', 10, 'badges', public._badges(uid));
end $$;

-- 兑换礼品：上架中、没过期、等级够、有库存、没超每人限额、余额够才扣。同一用户加锁，连点也不会扣成负数。
create or replace function public.redeem(c text, contact text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); i public.shop_items; bal int; used int; oid bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:' || uid::text, 0));
  select * into i from public.shop_items where code = c for update;
  if i.code is null or i.status <> 'on' or (i.ends_at is not null and i.ends_at < now()) then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if public.wool_level(public._earned(uid)) < i.min_level then return jsonb_build_object('ok', false, 'reason', 'level'); end if;
  if i.ship <> 'online' and char_length(coalesce(trim(contact), '')) < 2 then return jsonb_build_object('ok', false, 'reason', 'contact'); end if;
  if i.stock is not null and (select count(*) from public.shop_orders where item = c and status <> 'cancelled') >= i.stock then
    return jsonb_build_object('ok', false, 'reason', 'stock');
  end if;
  if (select count(*) from public.shop_orders where item = c and user_id = uid and status <> 'cancelled') >= i.per_user then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;
  bal := coalesce((select sum(delta) from public.wool_ledger where user_id = uid), 0);
  if bal < i.cost then return jsonb_build_object('ok', false, 'reason', 'balance', 'need', i.cost - bal); end if;
  insert into public.shop_orders (user_id, item, cost, contact) values (uid, c, i.cost, nullif(left(trim(contact), 200), '')) returning id into oid;
  perform public._give(uid, -i.cost, 'shop', oid::text, '兑换：' || i.title);
  return jsonb_build_object('ok', true, 'order', oid, 'balance', bal - i.cost);
end $$;

-- 用户自己取消还没处理的兑换（羊毛由下面的触发器退回）
create or replace function public.cancel_order(o bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.shop_orders set status = 'cancelled', note = coalesce(note, '你自己取消了') where id = o and user_id = uid and status = 'pending';
  return jsonb_build_object('ok', found);
end $$;

-- 订单改成 cancelled（用户取消或后台取消）时退回羊毛，每单只退一次
create or replace function public.order_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  new.updated_at := now();
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    select title into t from public.shop_items where code = new.item;
    perform public._give(new.user_id, new.cost, 'refund', new.id::text, '退回：' || coalesce(t, new.item));
  elsif old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception '已取消的订单不能恢复，请让用户重新兑换';
  end if;
  return new;
end $$;
drop trigger if exists shop_orders_changed on public.shop_orders;
create trigger shop_orders_changed before update on public.shop_orders
  for each row execute function public.order_changed();

-- 后台把悬赏改成 approved 时自动发羊毛、记行为、查成就
create or replace function public.bounty_reviewed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare q public.quests;
begin
  if new.status is distinct from old.status then new.reviewed_at := now(); end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select * into q from public.quests where code = new.quest;
    perform public._give(new.user_id, q.reward, 'bounty', new.quest, '悬赏：' || q.title);
    insert into public.user_actions (user_id, action, day, n) values (new.user_id, 'bounty', public.uk_today(), 1)
    on conflict (user_id, action, day) do update set n = public.user_actions.n + 1;
  end if;
  return new;
end $$;
drop trigger if exists quest_submissions_review on public.quest_submissions;
create trigger quest_submissions_review before update on public.quest_submissions
  for each row execute function public.bounty_reviewed();

create or replace function public.bounty_badges() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform public._badges(new.user_id); return null; end $$;
drop trigger if exists quest_submissions_badges on public.quest_submissions;
create trigger quest_submissions_badges after update on public.quest_submissions
  for each row when (new.status = 'approved') execute function public.bounty_badges();

-- 内部函数不给前端直接调
do $$ declare f text; begin
  foreach f in array array['_earned(uuid)', '_profile_score(uuid)', '_give(uuid,int,text,text,text)', '_bump(uuid,text,int)', '_progress(uuid,public.quests)',
                           '_period(public.quests)', '_badges(uuid)', 'bounty_reviewed()', 'bounty_badges()', 'order_changed()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
revoke all on function public.hub_state(), public.check_in(), public.track(text), public.claim_quest(text),
                       public.submit_bounty(text, text, text), public.game_finish(text, int),
                       public.redeem(text, text), public.cancel_order(bigint) from public, anon;
grant execute on function public.hub_state(), public.check_in(), public.track(text), public.claim_quest(text),
                          public.submit_bounty(text, text, text), public.game_finish(text, int),
                          public.redeem(text, text), public.cancel_order(bigint) to authenticated;

-- ---------- 初始任务和成就（改文案、奖励直接改这里再跑一遍，或在 Table Editor 改） ----------
insert into public.quests (code, kind, title, body, reward, action, goal, sort) values
  ('n_profile', 'newbie', '填好羊毛档案',     '城市、学校、阶段、毕业年份和关心的类别都填上', 20, 'profile', 6, 1),
  ('n_checkin', 'newbie', '第一次签到',       '在个人中心点一下签到',                         5,  'checkin', 1, 2),
  ('n_game',    'newbie', '去游乐场玩一局',   '三个小游戏任选一个',                           5,  'game',    1, 3),
  ('n_email',   'newbie', '打开限时提醒',     '档案设置里勾选邮件提醒，好羊毛不错过',         5,  'email',   1, 4),
  ('d_checkin', 'daily',  '今日签到',         '每天来点一下',                                 1,  'checkin', 1, 10),
  ('d_weekly',  'daily',  '逛逛本周羊毛',     '打开首页「本周羊毛」看看有什么新的',           2,  'view_weekly', 1, 11),
  ('d_game',    'daily',  '玩两局小游戏',     '游乐场任意游戏',                               2,  'game',    2, 12),
  ('d_quiz',    'daily',  '答完今日问答',     '3 道题，答对越多羊毛越多',                     1,  'quiz',    1, 13),
  ('w_checkin', 'weekly', '本周签到 5 天',    '周一到周日任意 5 天',                          15, 'checkin', 5, 20),
  ('w_game',    'weekly', '本周玩 8 局游戏',  '游乐场任意游戏',                               10, 'game',    8, 21),
  ('w_bounty',  'weekly', '完成 1 个赏金任务', '小羊赏金里的真实任务，审核通过才算',          20, 'bounty',  1, 22)
on conflict (code) do update set kind = excluded.kind, title = excluded.title, body = excluded.body, reward = excluded.reward,
  action = excluded.action, goal = excluded.goal, sort = excluded.sort;

-- 示例赏金：上线前按实际情况改，或在 Table Editor 新增行（kind 填 bounty，cat 填 field / freebie / survey / poll）
insert into public.quests (code, kind, title, body, reward, tag, min_level, slots, link, ends_at, sort) values
  ('b_mcd_coupon', 'bounty', '核实：麦当劳纸质券还能用吗', '去格拉斯哥任意一家麦当劳，用穷鬼专区里的纸质券点一次，告诉我们哪家店、哪张券、能不能用。', 15, '核实', 2, 20, 'budget.html#mcd-glasgow', '2026-12-04 23:59+00', 30),
  ('b_new_coupon', 'bounty', '拍券：店里新出的纸质优惠券', '在格拉斯哥任意连锁店拿到新的纸质券？写清店名、券面内容和截止日（可以附图片链接）。审核通过后收录到网站。', 20, '拍券', 2, 30, null, null, 31),
  ('b_bf_price',   'bounty', '实测：黑五学生折扣叠加',     '黑五期间在任一品牌官网实测「学生折扣 + 黑五折扣」能不能叠加，写下品牌、折扣和结果。', 25, '实测', 3, 15, 'black-friday.html', '2026-12-02 23:59+00', 32)
on conflict (code) do nothing;

insert into public.badges (code, title, body, reward, sort) values
  ('hello',    '初来乍到', '注册 Sheeperks 账号',            2,  1),
  ('profile',  '档案齐全', '羊毛档案全部填完',               5,  2),
  ('streak7',  '七日不断', '连续签到 7 天',                  10, 3),
  ('streak30', '月度坚持', '连续签到 30 天',                 50, 4),
  ('gamer10',  '游乐场常客', '累计玩 10 局小游戏',           5,  5),
  ('jump1000', '跳跳高手', '小羊跳跳单局 1000 分',           10, 6),
  ('memory',   '过目不忘', '品牌翻翻乐拿到 3 星',            5,  7),
  ('quiz',     '羊毛学霸', '5 天问答全对',                   10, 8),
  ('bounty1',  '第一张悬赏', '第一个悬赏通过审核',           10, 9),
  ('bounty5',  '赏金猎人', '5 个悬赏通过审核',               30, 10),
  ('lv3',      '薅毛学徒', '升到 3 级',                      0,  11),
  ('lv5',      '牧场老手', '升到 5 级',                      0,  12)
on conflict (code) do update set title = excluded.title, body = excluded.body, reward = excluded.reward, sort = excluded.sort;

-- 小羊商店首批礼品：先全部「即将上架」（status = soon），备好货后在 Table Editor 把 status 改成 on、填 stock。
-- 价格只是起步建议，可以直接改；这里用 do nothing，重跑不会覆盖你在后台改过的值。
insert into public.shop_items (code, title, body, cost, cat, image, stock, per_user, min_level, ship, status, sort) values
  ('stickers',   '格村小羊表情贴纸',   '防水 PVC 模切，一版 9 枚，贴电脑、水杯、宿舍门', 60,   'merch', 'assets/shop/stickers.jpg',   null, 2, 1, 'meet', 'soon', 1),
  ('pin',        '小羊珐琅徽章',       '限定编号徽章，别在包上、帽子上',                 180,  'merch', 'assets/shop/pin.jpg',        null, 1, 2, 'meet', 'soon', 2),
  ('cardholder', '公交卡套',           '带挂绳的卡套，Young Scot 卡、学生证都能放',      220,  'merch', 'assets/shop/cardholder.jpg', null, 1, 2, 'meet', 'soon', 3),
  ('mug',        '「今日份羊毛已到账」搪瓷杯', '宿舍喝水泡面都行',                     380,  'merch', 'assets/shop/mug.jpg',        null, 1, 3, 'meet', 'soon', 4),
  ('tote',       '帆布袋 Bag for Life', '超市购物不用再买 10p 塑料袋',                   450,  'merch', 'assets/shop/tote.jpg',       null, 1, 3, 'meet', 'soon', 5),
  ('beanie',     'Wee Deals 毛线帽',    '格拉斯哥冬天刚需',                              700,  'merch', 'assets/shop/beanie.jpg',     null, 1, 4, 'meet', 'soon', 6),
  ('hoodie',     'Skint but Smart 卫衣', '牧场老手限定，背后印「穷鬼专区 · 终身会员」',  1500, 'merch', 'assets/shop/hoodie.jpg',     null, 1, 5, 'meet', 'soon', 7),
  ('coupon',     '本地商家券',          '格拉斯哥合作商家的折扣券，线上发券码',          100,  'coupon', null,                        null, 1, 2, 'online', 'soon', 20)
on conflict (code) do nothing;
