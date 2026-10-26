/* 登录 + 账号页，account.html（个人信息、档案设置）和 bounty.html（小羊赏金）共用。后端是 Supabase：邮箱 / 短信验证码登录，档案存 profiles 表。
   小羊赏金按网址 # 切换栏目（#home #bounty #shop #mine #badges #wallet；旧的 #hall 跳到 #bounty），对应 section[data-view]；
   签到、任务、成就、账本由 hub.js 渲染。档案表单只在 account.html，bounty.html 只读档案来显示名字。Supabase 客户端在 sp.js 里建。
   配置在 auth-config.js（build.py 生成）：url、key 为空时整页显示「接入中」；phone、wechat、qq 没开的方式显示「即将开放」。
   表结构和开通步骤见 supabase/README.md。 */
(function () {
  const C = window.SP_AUTH || {};
  const box = document.getElementById("acct");
  const $ = (s, el = box) => el.querySelector(s);
  const $$ = (s, el = box) => [...el.querySelectorAll(s)];
  const show = st => { box.dataset.state = st; };
  const msg = (t, bad) => { const m = $("[data-msg]"); m.textContent = t || ""; m.classList.toggle("bad", !!bad); };

  if (!window.SP || !SP.on) return show("off");
  const sb = SP.sb;
  const enabled = { email: true, phone: !!C.phone, wechat: !!C.wechat, qq: !!C.qq };

  // ---------- 登录方式切换 ----------
  $$("[data-tab]").forEach(t => {
    if (!enabled[t.dataset.tab]) t.insertAdjacentHTML("beforeend", "<i>即将开放</i>");
    t.addEventListener("click", () => pick(t.dataset.tab));
  });
  $$("[data-form]").forEach(f => {
    const on = enabled[f.dataset.form];
    f.classList.toggle("disabled", !on);
    $$("[data-soon]", f).forEach(p => { p.hidden = on; });
    $$("input, select, button, a.oauth", f).forEach(el => { if (!on) { el.disabled = true; el.setAttribute("aria-disabled", "true"); } });
  });
  function pick(name) {
    $$("[data-tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    $$("[data-form]").forEach(f => { f.hidden = f.dataset.form !== name; });
    msg("");
  }

  // 微信 / QQ：跳到 Edge Function 发起 OAuth，回调后带 token 回到本页（见 supabase/README.md）
  $$("[data-oauth]").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    const fn = C[a.dataset.oauth];
    if (fn) location.href = fn + "?redirect_to=" + encodeURIComponent(location.href.split("#")[0]);
  }));

  // ---------- 验证码登录（邮箱 / 手机号共用） ----------
  $$("form[data-form]").forEach(form => {
    const kind = form.dataset.form;
    const btn = $("button[type=submit]", form), resend = $("[data-resend]", form), otp = $(".otp", form);
    let target = "", timer = 0;

    const ident = () => {
      const v = form.elements.id.value.trim();
      if (kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : "";
      const n = v.replace(/[\s()-]/g, "").replace(/^0/, "");
      return /^\d{6,13}$/.test(n) ? form.elements.cc.value + n : "";
    };
    const cooldown = () => {
      let s = 60;
      resend.hidden = false;
      resend.disabled = true;
      clearInterval(timer);
      const tick = () => { resend.textContent = s > 0 ? `${s} 秒后可重新发送` : "重新发送"; resend.disabled = s-- > 0; if (s < -1) clearInterval(timer); };
      tick();
      timer = setInterval(tick, 1000);
    };
    async function send() {
      const id = ident();
      if (!id) return msg(kind === "email" ? "邮箱格式不对，再检查一下" : "手机号格式不对，英国号码不用加开头的 0", true);
      btn.disabled = true;
      msg("发送中…");
      // 没接自定义 SMTP 时邮件模板改不了，只有登录链接：让链接回到本页，SDK 从网址里取出会话
      const redirect = location.origin + location.pathname;
      const { error } = await sb.auth.signInWithOtp(kind === "email" ? { email: id, options: { emailRedirectTo: redirect } } : { phone: id });
      btn.disabled = false;
      if (error) return msg(error.status === 429 ? "发得太频繁了，过一分钟再试" : "验证码没发出去，稍后再试；一直不行请联系客服", true);
      target = id;
      $("[data-sent-to]", form).textContent = id;
      otp.hidden = false;
      form.elements.id.readOnly = true;
      btn.textContent = btn.dataset.labelVerify;
      msg("");
      cooldown();
      form.elements.code.focus();
    }
    async function verify() {
      // 位数跟 Supabase 后台 Email OTP Length 设置走（6–10 位），这里不写死
      const token = form.elements.code.value.replace(/\D/g, "");
      if (!/^\d{6,10}$/.test(token)) return msg("请输入邮件里的数字验证码", true);
      btn.disabled = true;
      msg("登录中…");
      const { error } = await sb.auth.verifyOtp(kind === "email" ? { email: target, token, type: "email" } : { phone: target, token, type: "sms" });
      btn.disabled = false;
      if (error) return msg("验证码不对或已过期，重新发送一个试试", true);
      msg("");
    }
    form.addEventListener("submit", e => { e.preventDefault(); otp.hidden ? send() : verify(); });
    resend.addEventListener("click", send);
    form.elements.id.addEventListener("dblclick", () => {  // 想换邮箱/号码：双击输入框重来
      if (otp.hidden) return;
      otp.hidden = true; form.elements.id.readOnly = false; btn.textContent = btn.dataset.labelSend; resend.hidden = true; clearInterval(timer);
    });
  });

  // ---------- 个人档案 ----------
  const pf = $("[data-profile]");
  const saved = $("[data-saved]");
  let user = null;

  // ---------- 小羊赏金栏目切换 ----------
  const views = $$("[data-view]").map(v => v.dataset.view);
  let fallback = "home";
  function route() {
    if (location.hash === "#hall") history.replaceState(null, "", "#bounty");
    const want = location.hash.slice(1);
    const name = views.includes(want) ? want : fallback;
    $$("[data-view]").forEach(v => { v.hidden = v.dataset.view !== name; });
    $$(".dock a").forEach(a => {
      const on = a.getAttribute("href") === "#" + name;
      a.classList.toggle("on", on);
      if (on) { a.setAttribute("aria-current", "page"); const d = a.parentElement; if (d.scrollWidth > d.clientWidth) d.scrollBy({ left: a.getBoundingClientRect().left - d.getBoundingClientRect().left - 16, behavior: "smooth" }); } else a.removeAttribute("aria-current");
    });
  }
  addEventListener("hashchange", () => {
    route();
    const body = $(".dock");  // 牧场地图在屏幕上方看不到时才滚回来
    if (body && box.dataset.state === "in" && body.getBoundingClientRect().top < 0) body.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  // 档案完整度：6 项各占一份（新手任务「填好羊毛档案」也按这 6 项算）
  function complete(p) {
    const done = [p.nickname, p.city, p.school, p.stage, p.grad_year, (p.interests || []).length].filter(Boolean).length;
    const el = $("[data-profile-pct]");
    if (el) el.textContent = done === 6 ? "已填完整 ✓" : `完整度 ${Math.round(done / 6 * 100)}% · 填完领 20 羊毛`;
  }

  function fill(p) {
    if (!pf) return head(p);
    const f = pf.elements;
    f.nickname.value = p.nickname || "";
    f.city.value = p.city || "";
    f.school.value = p.school || "";
    f.stage.value = p.stage || "";
    f.grad_year.value = p.grad_year || "";
    $$("input[name=interests]", pf).forEach(c => { c.checked = (p.interests || []).includes(c.value); });
    f.email_opt_in.checked = !!p.email_opt_in;
    head(p);
  }
  function head(p) {
    const id = user.email || user.phone || "";
    const name = p.nickname || id.split("@")[0] || "羊毛账户";
    const since = user.created_at ? new Date(user.created_at).toLocaleDateString("zh-CN", { year: "numeric", month: "long" }) + "加入" : "";
    $("[data-me-name]").textContent = name;
    $("[data-avatar]").textContent = [...name][0].toUpperCase();
    $("[data-me-meta]").textContent = [p.school, p.city, p.stage, since].filter(Boolean).join(" · ");
    $("[data-me-id]").textContent = id;
    complete(p);
    try { localStorage.setItem("sp-nick", name); } catch (e) {}
    const chip = document.querySelector(".acct");
    if (chip) { chip.classList.add("in"); chip.dataset.i = [...name][0].toUpperCase(); chip.querySelector("span").textContent = name; }
  }

  async function load() {
    show("in");
    const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) saved.textContent = "档案读取失败，刷新再试";
    route();
    fill(data || { nickname: (user.email || "").split("@")[0].slice(0, 20) });
    if (window.HUB) HUB.load(user);
  }

  if (pf) pf.addEventListener("submit", async e => {
    e.preventDefault();
    const f = pf.elements;
    const nickname = f.nickname.value.trim();
    if (!nickname) { saved.textContent = "昵称不能为空"; saved.classList.add("bad"); return f.nickname.focus(); }
    const row = {
      id: user.id, nickname, city: f.city.value || null, school: f.school.value.trim() || null, stage: f.stage.value || null,
      grad_year: f.grad_year.value ? +f.grad_year.value : null,
      interests: $$("input[name=interests]:checked", pf).map(c => c.value), email_opt_in: f.email_opt_in.checked,
    };
    saved.classList.remove("bad");
    saved.textContent = "保存中…";
    const { error } = await sb.from("profiles").upsert(row);
    saved.classList.toggle("bad", !!error);
    saved.textContent = error ? "保存失败：" + error.message : "已保存 ✓";
    if (!error) { head(row); if (window.HUB) HUB.refresh(); }
  });

  $("[data-signout]").addEventListener("click", async () => {
    await sb.auth.signOut();
    try { localStorage.removeItem("sp-nick"); } catch (e) {}
    location.reload();
  });
  const del = $("[data-delete]");
  if (del) del.addEventListener("click", async () => {
    if (!confirm("确定永久删除账号和全部档案？删除后不能恢复。")) return;
    const { error } = await sb.rpc("delete_me");
    if (error) return alert("删除失败：" + error.message);
    await sb.auth.signOut();
    try { localStorage.removeItem("sp-nick"); } catch (e) {}
    location.replace("./");
  });

  sb.auth.onAuthStateChange((ev, session) => {
    const u = session && session.user;
    // 回调里不能直接再调 sb（会卡住 auth 锁），放到下一轮
    if (u && (!user || user.id !== u.id)) { user = u; setTimeout(load); }
    else if (!u) { user = null; show("out"); }
  });
})();
