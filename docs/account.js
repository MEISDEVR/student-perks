/* 登录 + 个人档案（account.html）。后端是 Supabase：邮箱 / 短信验证码登录，档案存 profiles 表。
   配置在 auth-config.js（build.py 生成）：url、key 为空时整页显示「接入中」；phone、wechat、qq 没开的方式显示「即将开放」。
   表结构和开通步骤见 supabase/README.md。 */
(function () {
  const C = window.SP_AUTH || {};
  const box = document.getElementById("acct");
  const $ = (s, el = box) => el.querySelector(s);
  const $$ = (s, el = box) => [...el.querySelectorAll(s)];
  const show = st => { box.dataset.state = st; };
  const msg = (t, bad) => { const m = $("[data-msg]"); m.textContent = t || ""; m.classList.toggle("bad", !!bad); };

  if (!C.url || !C.key || !window.supabase) return show("off");
  const sb = window.supabase.createClient(C.url, C.key, { auth: { storageKey: "sheeperks-auth", detectSessionInUrl: true } });
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
      const { error } = await sb.auth.signInWithOtp(kind === "email" ? { email: id } : { phone: id });
      btn.disabled = false;
      if (error) return msg(error.status === 429 ? "发得太频繁了，过一分钟再试" : "发送失败：" + error.message, true);
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
      const token = form.elements.code.value.trim();
      if (!/^\d{6}$/.test(token)) return msg("请输入 6 位数字验证码", true);
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

  function fill(p) {
    const f = pf.elements;
    f.nickname.value = p.nickname || "";
    f.city.value = p.city || "";
    f.school.value = p.school || "";
    f.stage.value = p.stage || "";
    f.grad_year.value = p.grad_year || "";
    $$("input[name=interests]", pf).forEach(c => { c.checked = (p.interests || []).includes(c.value); });
    f.email_opt_in.checked = !!p.email_opt_in;
    head(p.nickname);
  }
  function head(nick) {
    const id = user.email || user.phone || "";
    const name = nick || id.split("@")[0] || "羊毛档案";
    $("[data-me-name]").textContent = name;
    $("[data-me-id]").textContent = id;
    $("[data-avatar]").textContent = [...name][0].toUpperCase();
    try { localStorage.setItem("sp-nick", name); } catch (e) {}
    const chip = document.querySelector(".acct");
    if (chip) { chip.classList.add("in"); chip.dataset.i = [...name][0].toUpperCase(); chip.querySelector("span").textContent = name; }
  }

  async function load() {
    show("in");
    const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) saved.textContent = "档案读取失败，刷新再试";
    fill(data || { nickname: (user.email || "").split("@")[0].slice(0, 20) });
  }

  pf.addEventListener("submit", async e => {
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
    if (!error) head(nickname);
  });

  $("[data-signout]").addEventListener("click", async () => {
    await sb.auth.signOut();
    try { localStorage.removeItem("sp-nick"); } catch (e) {}
    location.reload();
  });
  $("[data-delete]").addEventListener("click", async () => {
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
