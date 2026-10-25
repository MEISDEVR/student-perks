# 登录后端（Supabase）开通步骤

网站是 GitHub Pages 纯静态站，登录和个人档案交给 Supabase（免费档够起步用，额度以官网为准）。

## 1. 建项目（约 10 分钟，邮箱登录就能用）

1. 在 supabase.com 注册，New project，Region 选 **London (eu-west-2)**（数据留在英国，符合 UK GDPR）。
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
