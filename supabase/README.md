# 登录后端（Supabase）开通步骤

网站是 GitHub Pages 纯静态站，登录和个人档案交给 Supabase（免费档够起步用，额度以官网为准）。

## 1. 建项目（约 10 分钟，邮箱登录就能用）

1. 在 supabase.com 注册，New project，Region 点「Need a specific region?」选 **London (eu-west-2)**（数据留在英国，符合 UK GDPR）。Security 里勾 Enable Data API、Enable automatic RLS，「Automatically expose new tables」可以不勾（schema.sql 会单独授权）。
2. SQL Editor → 粘贴 `schema.sql` 全文 → Run。
3. Authentication → Sign In / Providers → Email：打开，关掉 "Confirm email"（验证码本身就是确认）。
4. Authentication → Emails → Templates → **Magic Link** 和 **Confirm signup** 两个模板，正文都改成显示验证码，例如：
   `<h2>Sheeperks 登录验证码</h2><p>你的验证码：<b style="font-size:24px">{{ .Token }}</b>，10 分钟内有效。</p>`
   （网站用 6 位验证码登录，不用点链接，微信内置浏览器里也能登。）
5. Authentication → URL Configuration：Site URL 填 `https://sheeperks.com`，Redirect URLs 加 `https://sheeperks.com/account.html`。
6. Project Settings → API：复制 **Project URL** 和 **anon public key**，填进 `source/build.py` 的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`，重新构建。
   anon key 本来就是给前端用的公开值，安全靠 `schema.sql` 里的行级权限，可以放进仓库。**service_role key 绝对不要放进仓库。**
7. 自带邮件发送每小时只有几封，正式上线前在 Authentication → Emails → SMTP Settings 接一个发信服务（Resend / Brevo 免费档即可），需要给 sheeperks.com 加几条 DNS 记录。

## 2. 手机号验证码（要短信服务商，按条付费）

Authentication → Providers → Phone，选 Twilio（或 MessageBird、Vonage），填账号 SID / token / 发信号码，然后把 `build.py` 里 `AUTH_PHONE` 改成 `True`。
- 英国 +44：Twilio 每条约 5 美分（以官网价为准），用英国号码或 Alphanumeric Sender ID（显示「Sheeperks」）即可发。
- 国内 +86：Twilio 发国内需要短信签名和模板报备，到达率不稳定；要稳定得用阿里云/腾讯云短信（要国内公司主体 + 签名审核），Supabase 不能直接接，要写一个 Send SMS Hook。

## 3. 微信 / QQ 登录（要资质，Supabase 没有内置）

两者都要写一个 Supabase Edge Function 做 OAuth 回调：拿 code 换 openid/unionid → 用 service_role 在 auth.users 里找到或建用户 → 生成登录会话 → 带回 account.html。接好后把函数地址填进 `build.py` 的 `AUTH_WECHAT` / `AUTH_QQ`。

- **微信网页扫码登录**：微信开放平台（open.weixin.qq.com）注册开发者账号并**企业认证**（年审费用以官网为准，要公司主体），创建「网站应用」，提交网站信息审核；网站域名一般要求 **ICP 备案**。sheeperks.com 在 GitHub Pages 上没有备案，需要一个备案域名做授权回调。
- **QQ 互联**：connect.qq.com 开发者认证（个人或企业），创建网站应用，审核要求网站已上线、有 QQ 登录按钮、域名有 **ICP 备案**。

在 UK 这边的同学多数是在电脑/手机浏览器或微信里打开网站：先上邮箱登录，手机号 +44 次之，微信/QQ 等公司主体和备案落实再接。

## 4. 任务系统 + 小羊赏金 + 小羊商店 + 游乐场

**先跑 SQL**：SQL Editor → 粘贴 `quests.sql` 全文 → Run（要在 `schema.sql` 之后跑）。**每次这个文件更新都再跑一遍**：表只会补新增的列和表，函数会更新，种子数据不会覆盖你在后台改过的值，也不会清掉用户数据。没跑之前个人中心会显示「任务系统正在开通」，登录和档案照常能用。

- **羊毛只能由服务器发和扣**：所有操作都走 `check_in` / `claim_quest` / `game_finish` / `redeem` 等函数，账本 `wool_ledger` 有唯一键防重复；用户只能读自己的数据，不能直接写表。羊毛不能购买、不能换现金。
- **审核小羊赏金**：Table Editor → `quest_submissions`，筛 `status = pending`，看 `content` / `link`，把 `status` 改成 `approved`（自动发羊毛、记成就）或 `rejected`，`note` 里写原因，用户在「我的任务」里能看到。
- **发一个赏金任务**：Table Editor → `quests` → Insert row：`code` 用 `b_` 开头的英文短名，`kind = bounty`，`cat` 选 `field`（实地任务）/ `freebie`（商家赠品）/ `survey`（问卷）/ `poll`（投票），填 `title`、`body`、`reward`、`min_level`（建议 2）、`slots`（名额，空=不限）、`ends_at`（截止日，空=长期），`active = true`。某个分类还没有任务时，页面显示「即将开放」板块。下线就把 `active` 改成 `false`。
- **小羊商店上架**：Table Editor → `shop_items`。首批 8 件默认 `status = soon`（只展示「即将上架」）。备好货后把 `status` 改成 `on`，`stock` 填库存（空=不限），`cost`、`min_level`、`per_user` 按需要改；不卖了改 `off`。图片放 `source/assets/shop/`，`image` 填 `assets/shop/文件名`。
- **处理兑换**：Table Editor → `shop_orders`，筛 `status = pending`，按 `contact` 联系用户。备好货或发了券码后改成 `ready`，`note` 里写取货时间地点或券码（用户在「我的兑换」里能看到）；交付后改 `done`。缺货或用户放弃就改 `cancelled`，羊毛自动退回（已取消的订单不能再改回来）。用户自己也能在处理前取消。
- **改日常/每周任务、成就奖励**：改 `quests.sql` 底部的种子数据再跑一次，或直接在 `quests` / `badges` 表里改。
- 每天的游戏羊毛上限、各游戏换算比例在 `game_finish` 函数里；问答题库在 `source/quiz.js`，题目答案要和站内页面一致。
