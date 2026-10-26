/* 小羊赏金页（bounty.html）的牧场证、签到、任务、赏金任务、小羊商店、成就、羊毛账本。
   数据一次从 hub_state() 拿；签到、领奖励、交赏金、兑换礼品都调 supabase/quests.sql 里的函数，前端只负责展示和动画。
   account.js 登录成功后调用 HUB.load(user)，档案保存后调用 HUB.refresh()。 */
(function () {
  if (!window.SP || !SP.on) return;
  const sb = SP.sb, esc = SP.esc, W = SP.wool, ico = SP.ico;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CI = [2, 2, 3, 3, 4, 4, 10];   // 连续签到第 1–7 天的羊毛，和 check_in() 一致
  const GO = { checkin: ["#home", "去签到"], view_weekly: ["./#weekly", "去逛逛"], game: ["games.html", "去玩"], quiz: ["games.html#quiz", "去答题"],
               profile: ["account.html", "去填写"], email: ["account.html", "去打开"], bounty: ["#bounty", "去做赏金"] };
  const QICO = { checkin: "flame", view_weekly: "eye", game: "gamepad", quiz: "bulb", profile: "card", email: "mail", bounty: "target" };
  const TAG = { 核实: ["search", "t-mint"], 拍券: ["camera", "t-yellow"], 实测: ["flask", "t-tomato"] };
  const GROUP = { daily: "今日任务", weekly: "本周任务", newbie: "新手任务" };
  // 小羊赏金分类（quests.cat）。还没有任务的分类显示「即将开放」板块
  const CATS = [
    { k: "field", name: "实地任务", icon: "pin", soon: "" },
    { k: "freebie", name: "商家赠品", icon: "gift", soon: "格拉斯哥商家免费送的新品、试吃和小样。到店领取或线上登记，用完写一句真实体验。" },
    { k: "survey", name: "问卷调研", icon: "survey", soon: "品牌和学校的问卷，5–10 分钟一份。只收不要求留敏感信息的。" },
    { k: "poll", name: "投票", icon: "poll", soon: "下一批周边做什么、下周推什么羊毛，大家投票定，投完就有羊毛。" },
  ];
  const SHIP = { meet: "格拉斯哥面交", post: "邮寄", online: "线上发券码" };
  const OST = { pending: ["待处理", "clock"], ready: ["待领取", "gift"], done: ["已完成", "check"], cancelled: ["已取消", "bolt"] };
  let catOn = "all", shopOn = "all";
  let S = null, user = null, defs = SP.BADGES, lvShown = 0;

  $$("[data-ico]").forEach(i => { i.outerHTML = ico(i.dataset.ico); });
  $$("[data-wool]").forEach(i => { i.outerHTML = W(); });
  window.HUB = { load, refresh };

  async function load(u) {
    user = u;
    $("[data-pass-no]").textContent = "No." + u.id.replace(/-/g, "").slice(0, 6).toUpperCase();
    await flushTrack();
    sb.from("badges").select("*").order("sort").then(({ data }) => {
      if (data && data.length) defs = data.map(b => ({ ...SP.badge(b.code), ...b, icon: SP.badge(b.code).icon }));
      if (S) { stamps(); recent(); }
    });
    await refresh();
    setInterval(tick, 1000);
    tick();
  }

  // 其他页面（首页「本周羊毛」等）记下的浏览行为，回到个人中心时补报给后端
  async function flushTrack() {
    let t;
    try { t = JSON.parse(localStorage.getItem("sp-track") || "null"); } catch (e) {}
    if (!t || t.day !== SP.ukToday()) return;
    await Promise.all([...new Set(t.a)].map(a => sb.rpc("track", { a })));
    try { localStorage.removeItem("sp-track"); } catch (e) {}
  }

  async function refresh() {
    const { data, error } = await sb.rpc("hub_state");
    $("[data-hub-off]").hidden = !error;
    $$(".hub-main [data-view] > *").forEach(el => el.classList.toggle("is-off", !!error));
    if (error) return;
    S = data;
    pass(); checkin(); ["daily", "weekly", "newbie"].forEach(group); promo(); recent(); bounties(); mine(); stamps(); wallet(); shop(); counts();
  }

  const quests = kind => S.quests.filter(q => q.kind === kind);
  const ready = q => q.kind !== "bounty" && !q.claimed && q.progress >= q.goal;

  // ---------- 牧场证 ----------
  function pass() {
    const L = SP.level(S.earned);
    $("[data-balance]").textContent = S.balance;
    $("[data-week]").textContent = S.week;
    $("[data-earned]").textContent = S.earned;
    $("[data-streak]").textContent = S.streak;
    $("[data-streak-box]").classList.toggle("hot", S.streak >= 3);
    $("[data-ring]").style.setProperty("--p", L.pct);
    $("[data-ring-lv]").textContent = L.lv;
    $("[data-lv-chip]").textContent = `Lv.${L.lv} ${L.name}`;
    $("[data-xp-bar]").style.width = L.pct + "%";
    $("[data-xp-tip]").innerHTML = L.next ? `再赚 <b>${L.next - S.earned}</b> 羊毛升到 <b>Lv.${L.lv + 1} ${L.nextName}</b>` : "满级了，你就是牧场里的金羊毛";
    if (lvShown && L.lv > lvShown) levelUp(L);
    lvShown = L.lv;
    try { if (S.checked) localStorage.setItem("sp-ci", S.today); } catch (e) {}
    const chip = $(".acct");
    if (chip) chip.classList.toggle("dot", !S.checked);
  }

  function levelUp(L) {
    const m = document.createElement("div");
    m.className = "lvup";
    m.innerHTML = `<div class="lvup-card" role="dialog" aria-label="升级"><span class="eyebrow">LEVEL UP</span>
      <div class="lvup-n">${W()}<b>Lv.${L.lv}</b></div><h3>升级成「${esc(L.name)}」</h3>
      <p>${L.next ? `下一级「${esc(L.nextName)}」要累计 ${L.next} 羊毛` : "最高等级，牧场里的金羊毛就是你"}</p>
      <button class="btn" type="button">好耶</button></div>`;
    document.body.append(m);
    const close = () => m.remove();
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("button")) close(); });
    SP.burst($(".lvup-n", m), null, 12);
  }

  // ---------- 签到 ----------
  function checkin() {
    const s = S.streak, done = S.checked;
    const pos = done ? (s - 1) % 7 + 1 : s % 7 + 1;          // 今天是这一轮的第几天
    const reward = CI[pos - 1], tomorrow = CI[pos % 7];
    const cells = CI.map((r, i) => {
      const n = i + 1, st = n < pos || (n === pos && done) ? "done" : n === pos ? "today" : "next";
      return `<li class="d ${st}${n === 7 ? " gift" : ""}${n === pos ? " is-today" : ""}">
        <span class="d-n">${n === pos ? "今天" : "第 " + n + " 天"}</span>
        <span class="d-r">${n === 7 ? ico("gift") : W()}<b>+${r}</b></span>
        ${st === "done" ? `<span class="d-stamp">已签</span>` : ""}</li>`;
    }).join("");
    const days = new Set(S.checkins), today = new Date(S.today + "T12:00:00Z");
    const heat = Array.from({ length: 35 }, (_, i) => {
      const d = new Date(today - (34 - i) * 864e5).toISOString().slice(0, 10);
      return `<i class="${days.has(d) ? "on" : ""}${d === S.today ? " now" : ""}" title="${d}"></i>`;
    }).join("");
    $("[data-checkin]").innerHTML = `
      <div class="panel-h"><h3>每日签到</h3><span class="muted">连续 <b>${s}</b> 天 · 7 天一轮，第 7 天 +10</span></div>
      <ol class="ci-days">${cells}</ol>
      <div class="ci-foot">
        <button class="btn ci-btn" type="button" data-checkin-btn ${done ? "disabled" : ""}>${done ? `${ico("check")}今日已签 · 明天 +${tomorrow}` : `${ico("flame")}签到 领 +${reward} 羊毛`}</button>
        <span class="muted">${done ? `下次签到还有 <b class="mono" data-to-midnight></b>` : "断签会从第 1 天重新算"}</span>
      </div>
      <div class="heat"><span class="muted">最近 5 周</span><div class="heat-grid">${heat}</div></div>`;
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-checkin-btn]");
    if (!b || b.disabled) return;
    b.disabled = true;
    const { data, error } = await sb.rpc("check_in");
    if (error || !data.ok) { b.disabled = false; return SP.toast(data && data.reason === "already" ? "今天已经签过了" : "签到没成功，稍后再试", "bad"); }
    const cell = $("[data-checkin] .is-today");
    if (cell) { cell.classList.add("stamping"); cell.insertAdjacentHTML("beforeend", `<span class="d-stamp">已签</span>`); }
    SP.burst(b, $("[data-balance-box]"), 8);
    SP.gain(data.reward, `连续签到第 ${data.streak} 天`);
    toastBadges(data.badges);
    setTimeout(refresh, 900);
  });

  // ---------- 任务 ----------
  function qrow(q) {
    const pct = Math.round(Math.min(q.progress, q.goal) / q.goal * 100), go = GO[q.action] || ["#bounty", "去完成"];
    const act = q.claimed ? `<span class="q-done">${ico("check")}已领</span>`
      : ready(q) ? `<button class="btn sm claim" type="button" data-claim="${esc(q.code)}">领取</button>`
      : `<a class="btn sm ghost" href="${esc(go[0])}">${go[1]}</a>`;
    return `<li class="q${q.claimed ? " is-claimed" : ready(q) ? " is-ready" : ""}">
      <span class="q-ico">${ico(QICO[q.action] || "star")}</span>
      <div class="q-t"><b>${esc(q.title)}</b><small>${esc(q.body)}</small>
        ${q.goal > 1 ? `<div class="q-prog"><span class="meter"><i style="width:${pct}%"></i></span><small class="mono">${Math.min(q.progress, q.goal)}/${q.goal}</small></div>` : ""}</div>
      <span class="q-r">+${q.reward}${W()}</span>${act}</li>`;
  }

  function group(kind) {
    const qs = quests(kind), got = qs.filter(q => q.claimed).length, sum = qs.reduce((a, q) => a + q.reward, 0);
    const right = kind === "daily" ? `${ico("clock")}<b class="mono" data-to-midnight></b> 后刷新`
      : kind === "weekly" ? `${ico("clock")}每周一 00:00 刷新` : `${got}/${qs.length} · 共 ${sum} 羊毛`;
    $$(`[data-group=${kind}]`).forEach(el => {
      const home = !el.dataset.kind;
      el.hidden = !qs.length || (home && kind === "newbie" && got === qs.length);
      el.innerHTML = `<div class="panel-h"><h3>${GROUP[kind]}</h3><span class="muted">${right}</span></div>
        ${kind === "newbie" ? `<div class="meter big"><i style="width:${qs.length ? got / qs.length * 100 : 0}%"></i></div>` : ""}
        <ul class="qs${kind === "newbie" ? " steps" : ""}">${qs.map(qrow).join("")}</ul>`;
    });
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-claim]");
    if (!b || b.disabled) return;
    b.disabled = true;
    const { data, error } = await sb.rpc("claim_quest", { c: b.dataset.claim });
    if (error || !data.ok) { b.disabled = false; return SP.toast(data && data.reason === "already" ? "这个周期已经领过了" : "还没完成，再看看任务要求", "bad"); }
    SP.burst(b, $("[data-balance-box]"), 6);
    SP.gain(data.reward, S.quests.find(q => q.code === b.dataset.claim).title);
    toastBadges(data.badges);
    setTimeout(refresh, 900);
  });

  function promo() {
    const g = S.game_today;
    $("[data-promo]").innerHTML = `
      <img class="promo-sheep" src="assets/logo.svg" alt="" width="120" height="120">
      <span class="eyebrow">ARCADE · 羊毛游乐场</span>
      <h3>玩两局，赚点羊毛</h3>
      <div class="promo-games"><span>${ico("jump")}小羊跳跳</span><span>${ico("cards")}品牌翻翻乐</span><span>${ico("bulb")}今日问答</span></div>
      <div class="promo-meter"><span class="meter"><i style="width:${g * 10}%"></i></span><span class="mono">今日 ${g}/10 ${W()}</span></div>
      <span class="promo-go">${ico("arrow")}</span>`;
  }

  // ---------- 成就 ----------
  const earnedMap = () => new Map(S.badges.map(b => [b.code, b.at]));
  function stamp(b, at, i) {
    return `<li class="stamp ${at ? "on c" + (i % 4) : "off"}">
      <span class="stamp-face"><svg class="stamp-edge" viewBox="0 0 24 24" aria-hidden="true"><path d="${SP.SCALLOP}"/></svg>${ico(at ? b.icon : "lock")}</span>
      <b>${esc(b.title)}</b><small>${esc(b.body)}</small>
      <em>${at ? new Date(at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) + " 解锁" : b.reward ? `+${b.reward} 羊毛` : "解锁称号"}</em></li>`;
  }
  function stamps() {
    const m = earnedMap(), got = defs.filter(b => m.has(b.code));
    const pct = Math.round(got.length / defs.length * 100);
    $("[data-badge-head]").innerHTML = `
      <div class="ring big" style="--p:${pct}"><b>${got.length}<small>/${defs.length}</small></b></div>
      <div><span class="eyebrow">ACHIEVEMENTS · 成就邮票册</span><h2>集邮票，攒称号</h2>
      <p class="muted">完成特定目标自动盖章，部分成就附送羊毛。已经拿到 ${got.reduce((a, b) => a + (b.reward || 0), 0)} 羊毛成就奖励。</p></div>`;
    $("[data-stamps]").innerHTML = defs.map((b, i) => stamp(b, m.get(b.code), i)).join("");
  }
  function recent() {
    const m = earnedMap(), last = defs.filter(b => m.has(b.code)).sort((a, b) => m.get(b.code) < m.get(a.code) ? -1 : 1).slice(0, 3);
    $("[data-recent-badges]").innerHTML = `<div class="panel-h"><h3>最近成就</h3><a class="muted" href="#badges">全部 ${m.size}/${defs.length} →</a></div>
      ${last.length ? `<ul class="stamps mini">${last.map(b => stamp(b, m.get(b.code), defs.indexOf(b))).join("")}</ul>` : `<p class="muted">还没有成就，签个到就有第一枚。</p>`}`;
  }
  function toastBadges(codes) {
    (codes || []).forEach((c, i) => setTimeout(() => {
      const b = defs.find(d => d.code === c) || SP.badge(c);
      SP.toast(`${ico(b.icon)}<b>解锁成就</b><span>${esc(b.title)}${b.reward ? ` +${b.reward}` : ""}</span>`, "badge");
    }, 700 + i * 500));
  }

  // ---------- 悬赏 ----------
  function deadline(t) {
    if (!t) return "长期有效";
    const d = Math.ceil((new Date(t) - Date.now()) / 864e5);
    return d < 0 ? "已截止" : d === 0 ? "今天截止" : `还剩 ${d} 天`;
  }
  function bcard(q, lv) {
    const [ic, cls] = TAG[q.tag] || [(CATS.find(c => c.k === q.cat) || CATS[0]).icon, "t-blue"], sub = q.submission, locked = lv < q.min_level, full = q.left !== null && q.left <= 0;
    const act = sub && sub.status === "pending" ? `<span class="b-st pend">${ico("clock")}审核中</span>`
      : sub && sub.status === "approved" ? `<span class="b-st ok">${ico("check")}已通过</span>`
      : locked ? `<span class="b-st lock">${ico("lock")}Lv.${q.min_level} 解锁</span>`
      : full && !sub ? `<span class="b-st lock">名额已满</span>`
      : `<button class="btn sm" type="button" data-bounty="${esc(q.code)}">${sub ? "重新提交" : "接任务"}</button>`;
    return `<article class="bounty ${cls}${locked ? " locked" : ""}${sub ? " s-" + sub.status : ""}">
      <div class="b-main">
        <span class="b-tag">${ico(ic)}${esc(q.tag || (CATS.find(c => c.k === q.cat) || CATS[0]).name)}</span>
        <h3>${esc(q.title)}</h3><p>${esc(q.body)}</p>
        ${sub && sub.status === "rejected" ? `<p class="b-note">${ico("bolt")}未通过${sub.note ? "：" + esc(sub.note) : ""}，可以修改后重新提交</p>` : ""}
        <div class="b-meta">
          ${q.slots ? `<span class="b-slots"><span class="meter"><i style="width:${Math.max(q.left, 0) / q.slots * 100}%"></i></span>剩 ${Math.max(q.left, 0)}/${q.slots} 份</span>` : "<span>名额不限</span>"}
          <span>${ico("clock")}${deadline(q.ends_at)}</span>
          ${q.min_level > 1 ? `<span>${ico("chevrons")}Lv.${q.min_level}+</span>` : ""}
          ${q.link ? `<a href="${esc(q.link)}">相关页面 →</a>` : ""}
        </div>
      </div>
      <div class="b-stub"><span class="b-r"><b>+${q.reward}</b>${W()}</span>${act}</div>
    </article>`;
  }
  function bounties() {
    const lv = SP.level(S.earned).lv, all = quests("bounty"), n = k => all.filter(q => (q.cat || "field") === k).length;
    $("[data-cats]").innerHTML = [`<button type="button" data-cat="all" aria-pressed="${catOn === "all"}">全部 <small>${all.length}</small></button>`]
      .concat(CATS.map(c => `<button type="button" data-cat="${c.k}" aria-pressed="${catOn === c.k}">${ico(c.icon)}${c.name} <small>${n(c.k) || "即将开放"}</small></button>`)).join("");
    const list = all.filter(q => catOn === "all" || (q.cat || "field") === catOn);
    $("[data-bounties]").innerHTML = list.length ? list.map(q => bcard(q, lv)).join("")
      : catOn === "all" || !CATS.find(c => c.k === catOn).soon
        ? `<div class="empty"><img src="assets/logo.svg" alt="" width="72" height="72"><b>暂时没有赏金任务</b><span>新任务会在群里通知，先做做每日任务。</span></div>` : "";
    const soon = CATS.filter(c => c.soon && !n(c.k) && (catOn === "all" || catOn === c.k));
    $("[data-soon-boards]").innerHTML = soon.map(c => `<article class="soon-board sb-${c.k}">
      <span class="sb-ico">${ico(c.icon)}</span><div><span class="b-tag">${ico("clock")}即将开放</span><h3>${c.name}</h3><p>${c.soon}</p></div></article>`).join("");
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    catOn = b.dataset.cat;
    bounties();
  });

  const sheet = $("[data-sheet]"), sform = $("[data-sheet-form]");
  let cur = null;
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-bounty]");
    if (!b) return;
    cur = S.quests.find(q => q.code === b.dataset.bounty);
    const [ic, cls] = TAG[cur.tag] || ["target", "t-blue"];
    $("[data-sheet-tag]").className = "sheet-tag " + cls;
    $("[data-sheet-tag]").innerHTML = `${ico(ic)}${esc(cur.tag || "悬赏")} · +${cur.reward} ${W()}`;
    $("[data-sheet-title]").textContent = cur.title;
    $("[data-sheet-body]").textContent = cur.body;
    sform.content.value = cur.submission ? cur.submission.content : "";
    sform.link.value = "";
    $("[data-sheet-msg]").textContent = "";
    sheet.showModal();
  });
  sform.addEventListener("submit", async e => {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    const msg = $("[data-sheet-msg]"), content = sform.content.value.trim();
    if (content.length < 4) { msg.className = "acct-msg bad"; msg.textContent = "写详细一点，至少 4 个字"; return; }
    msg.className = "acct-msg"; msg.textContent = "提交中…";
    const { data, error } = await sb.rpc("submit_bounty", { c: cur.code, content, link: sform.link.value.trim() || null });
    if (error || !data.ok) {
      msg.className = "acct-msg bad";
      msg.textContent = { closed: "这个悬赏已经截止了", level: `需要 Lv.${cur.min_level} 才能接`, already: "你已经交过了，等审核结果", full: "名额刚好满了", short: "写详细一点" }[data && data.reason] || "提交失败，稍后再试";
      return;
    }
    sheet.close();
    SP.toast(`${ico("check")}<b>已提交</b><span>审核通过后发 ${cur.reward} 羊毛</span>`, "badge");
    refresh();
  });

  // ---------- 我的任务 ----------
  function mine() {
    const subs = S.quests.filter(q => q.submission);
    const col = (st, title, icon) => {
      const xs = subs.filter(q => q.submission.status === st);
      return `<div class="kb kb-${st}"><div class="kb-h">${ico(icon)}<b>${title}</b><span class="mono">${xs.length}</span></div>
        ${xs.map(q => `<article class="kb-card"><b>${esc(q.title)}</b><p>${esc(q.submission.content)}</p>
          ${q.submission.note ? `<p class="b-note">${esc(q.submission.note)}</p>` : ""}
          <div class="kb-foot"><span class="mono">${new Date(q.submission.at).toLocaleDateString("zh-CN")}</span><span class="q-r">${st === "approved" ? "+" : ""}${q.reward}${W()}</span></div></article>`).join("")
        || `<p class="kb-empty">${{ pending: "没有在审核的", approved: "还没有通过的", rejected: "没有被退回的" }[st]}</p>`}</div>`;
    };
    const today = S.quests.filter(q => q.claimed && q.kind !== "newbie");
    $("[data-mine]").innerHTML = (subs.length ? col("pending", "审核中", "clock") + col("approved", "已通过", "check") + col("rejected", "未通过", "bolt")
      : `<div class="empty wide"><img src="assets/logo.svg" alt="" width="88" height="88"><b>还没有交过赏金任务</b><span>去小羊赏金接一个，帮大家核实优惠还能赚羊毛。</span><a class="btn" href="#bounty">去小羊赏金</a></div>`)
      + `<div class="kb kb-today"><div class="kb-h">${ico("star")}<b>本期已领奖励</b><span class="mono">${today.length}</span></div>
        ${today.map(q => `<div class="kb-line"><span>${esc(q.title)}</span><span class="q-r">+${q.reward}${W()}</span></div>`).join("") || `<p class="kb-empty">今天还没领任务奖励</p>`}</div>`;
  }

  // ---------- 羊毛账本 ----------
  function wallet() {
    let last = "";
    const rows = S.ledger.map(l => {
      const d = new Date(l.created_at), day = d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
      const head = day !== last ? `<div class="rc-day">${day}</div>` : "";
      last = day;
      return head + `<div class="rc-row"><span class="mono">${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span><span>${esc(l.note)}</span><b class="${l.delta > 0 ? "plus" : "minus"}">${l.delta > 0 ? "+" : ""}${l.delta}</b></div>`;
    }).join("");
    $("[data-receipt]").innerHTML = `<div class="rc">
      <div class="rc-top"><img src="assets/logo.svg" alt="" width="44" height="44"><b>SHEEPERKS</b><span class="mono">WOOL RECEIPT · 羊毛账本</span><span class="mono">${esc(user.email || "")}</span></div>
      <div class="rc-rows">${rows || `<p class="muted rc-empty">还没有羊毛记录，先去签个到。</p>`}</div>
      <div class="rc-total"><span>余额</span><b>${S.balance}${W()}</b></div>
      <div class="rc-foot mono">累计获得 ${S.earned} · 显示最近 40 笔<br>* 羊毛不能购买，不能换现金 *</div></div>`;
    const L = SP.level(S.earned);
    $("[data-earn-rules]").innerHTML = `<div class="panel-h"><h3>羊毛怎么赚</h3></div>
      <ul class="rules">
        <li>${ico("flame")}<b>每日签到</b><span>2–10，连签越久越多</span></li>
        <li>${ico("calendar")}<b>每日 / 每周任务</b><span>1–20，进度满了点领取</span></li>
        <li>${ico("target")}<b>小羊赏金</b><span>15–25，审核通过发放</span></li>
        <li>${ico("gamepad")}<b>小游戏</b><span>每天最多 10</span></li>
        <li>${ico("trophy")}<b>成就奖励</b><span>解锁时一次性发放</span></li>
      </ul>
      <div class="panel-h"><h3>等级</h3><span class="muted">按累计获得算，兑换不掉级</span></div>
      <ol class="ladder">${SP.LEVELS.map(([n, name], i) => `<li class="${i + 1 < L.lv ? "past" : i + 1 === L.lv ? "now" : ""}"><b>Lv.${i + 1}</b><span>${name}</span><em class="mono">${n}</em></li>`).join("")}</ol>`;
  }

  function counts() {
    const lv = SP.level(S.earned).lv;
    const n = quests("bounty").filter(q => !q.submission && lv >= q.min_level && !(q.left !== null && q.left <= 0)).length, c = $("[data-count=bounty]");
    c.hidden = !n; c.textContent = n;
    $(".hub-tabs a[href='#home']").classList.toggle("dot", !S.checked || S.quests.some(ready));
  }

  // ---------- 小羊商店 ----------
  function good(it, lv) {
    const soon = it.status === "soon", locked = lv < it.min_level, out = it.left !== null && it.left <= 0, maxed = it.mine >= it.per_user;
    const poor = S.balance < it.cost, pct = Math.min(100, Math.round(S.balance / it.cost * 100));
    const act = soon ? `<span class="b-st lock">${ico("clock")}即将上架</span>`
      : locked ? `<span class="b-st lock">${ico("lock")}Lv.${it.min_level} 可换</span>`
      : out ? `<span class="b-st lock">已换完</span>`
      : maxed ? `<span class="b-st ok">${ico("check")}已兑换</span>`
      : poor ? `<span class="b-st lock">还差 ${it.cost - S.balance}</span>`
      : `<button class="btn sm" type="button" data-buy-btn="${esc(it.code)}">兑换</button>`;
    return `<article class="good${soon ? " is-soon" : ""}${locked ? " locked" : ""}${!soon && !locked && !out && !maxed && !poor ? " can" : ""}">
      <div class="good-img">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" width="320" height="240">` : `<span class="good-ph">${ico(it.cat === "coupon" ? "ticket" : "gift")}</span>`}
        ${soon ? `<span class="good-flag">即将上架</span>` : it.left !== null ? `<span class="good-flag">剩 ${Math.max(it.left, 0)}</span>` : ""}
        ${it.min_level > 1 ? `<span class="good-lv">Lv.${it.min_level}+</span>` : ""}</div>
      <div class="good-b">
        <h3>${esc(it.title)}</h3><p>${esc(it.body)}</p>
        <span class="good-ship">${ico(it.ship === "online" ? "mail" : "pin")}${SHIP[it.ship] || ""}${it.per_user > 1 ? ` · 每人 ${it.per_user} 份` : ""}</span>
      </div>
      <div class="good-f">
        <span class="good-cost"><b>${it.cost}</b>${W()}</span>${act}
        ${!soon && !locked && poor ? `<span class="meter good-meter"><i style="width:${pct}%"></i></span>` : ""}
      </div>
    </article>`;
  }
  function shop() {
    const lv = SP.level(S.earned).lv, items = S.shop || [], live = items.filter(i => i.status === "on");
    const next = items.filter(i => S.balance < i.cost && i.status === "on").sort((a, b) => a.cost - b.cost)[0];
    $("[data-shop-head]").innerHTML = `
      <div><div class="eyebrow">SHEEP SHOP · 小羊商店</div><h2>用羊毛换<mark>小羊周边</mark></h2>
        <p>签到、赏金、小游戏攒下的羊毛在这里换礼品。周边在格拉斯哥面交，商家券线上发码。羊毛不能买，也不能换现金。</p></div>
      <div class="shop-bal"><span class="stub-k">可用羊毛</span><b class="stub-n">${W()}<span>${S.balance}</span></b>
        <span class="muted">${live.length ? next ? `再攒 <b>${next.cost - S.balance}</b> 能换「${esc(next.title)}」` : "有礼品可以换了" : "第一批礼品准备中，先攒着"}</span></div>`;
    const cats = [["all", "全部"], ["merch", "小羊周边"], ["coupon", "商家券"]].filter(([k]) => k === "all" || items.some(i => i.cat === k));
    $("[data-shop-cats]").innerHTML = cats.map(([k, n]) => `<button type="button" data-shop-cat="${k}" aria-pressed="${shopOn === k}">${n}</button>`).join("");
    const list = items.filter(i => shopOn === "all" || i.cat === shopOn);
    $("[data-goods]").innerHTML = list.length ? list.map(i => good(i, lv)).join("")
      : `<div class="empty"><img src="assets/logo.svg" alt="" width="72" height="72"><b>商店还在进货</b><span>先攒羊毛，礼品上架会在群里通知。</span></div>`;
    const os = S.orders || [];
    $("[data-orders]").innerHTML = `<div class="panel-h"><h3>我的兑换</h3><span class="muted">${os.length} 单</span></div>` + (os.length
      ? `<ul class="orders">${os.map(o => `<li class="o o-${o.status}">
          ${o.image ? `<img src="${esc(o.image)}" alt="" width="64" height="48">` : `<span class="good-ph sm">${ico("ticket")}</span>`}
          <div><b>${esc(o.title)}</b><small class="mono">${new Date(o.at).toLocaleDateString("zh-CN")} · -${o.cost} 羊毛</small>
            ${o.note ? `<p>${esc(o.note)}</p>` : o.status === "pending" ? `<p class="muted">客服会尽快联系你${o.contact ? "（" + esc(o.contact) + "）" : ""}</p>` : ""}</div>
          <span class="o-st">${ico(OST[o.status][1])}${OST[o.status][0]}</span>
          ${o.status === "pending" ? `<button class="linkish" type="button" data-cancel-order="${o.id}">取消</button>` : ""}</li>`).join("")}</ul>`
      : `<p class="muted">还没有兑换过。礼品上架后，在上面点「兑换」就行。</p>`);
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-shop-cat]");
    if (!b) return;
    shopOn = b.dataset.shopCat;
    shop();
  });

  const buy = $("[data-buy]"), bform = $("[data-buy-form]");
  let item = null;
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-buy-btn]");
    if (!b) return;
    item = S.shop.find(i => i.code === b.dataset.buyBtn);
    const img = $("[data-buy-img]");
    img.hidden = !item.image;
    if (item.image) img.src = item.image;
    $("[data-buy-tag]").innerHTML = `${ico("shop")}${item.cost} ${W()} · ${SHIP[item.ship]}`;
    $("[data-buy-title]").textContent = item.title;
    $("[data-buy-body]").textContent = item.body;
    $("[data-buy-after]").innerHTML = `${S.balance} − ${item.cost} = ${S.balance - item.cost}${W()}`;
    $("[data-buy-contact]").hidden = item.ship === "online";
    try { bform.contact.value = localStorage.getItem("sp-contact") || ""; } catch (err) {}
    $("[data-buy-msg]").textContent = "";
    buy.showModal();
  });
  bform.addEventListener("submit", async e => {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    const msg = $("[data-buy-msg]"), contact = bform.contact.value.trim();
    if (item.ship !== "online" && contact.length < 2) { msg.className = "acct-msg bad"; msg.textContent = "留个微信号或邮箱，客服才能约你"; return; }
    msg.className = "acct-msg"; msg.textContent = "兑换中…";
    const { data, error } = await sb.rpc("redeem", { c: item.code, contact: item.ship === "online" ? null : contact });
    if (error || !data.ok) {
      msg.className = "acct-msg bad";
      msg.textContent = { closed: "这件暂时不能兑换了", level: `需要 Lv.${item.min_level}`, stock: "刚好被换完了", limit: "你已经换过了", contact: "留个联系方式",
                          balance: `羊毛不够，还差 ${data && data.need}` }[data && data.reason] || "兑换失败，稍后再试";
      return;
    }
    try { if (contact) localStorage.setItem("sp-contact", contact); } catch (err) {}
    buy.close();
    SP.toast(`${ico("gift")}<b>兑换成功</b><span>${esc(item.title)} · 客服会联系你</span>`, "badge");
    refresh();
  });
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-cancel-order]");
    if (!b || !confirm("取消这次兑换？羊毛会退回。")) return;
    b.disabled = true;
    const { data, error } = await sb.rpc("cancel_order", { o: Number(b.dataset.cancelOrder) });
    if (error || !data.ok) { b.disabled = false; return SP.toast("已经在处理了，取消不了，联系客服吧", "bad"); }
    SP.toast(`${ico("check")}<b>已取消</b><span>羊毛已退回</span>`, "badge");
    refresh();
  });

  let lastMs = Infinity;
  function tick() {
    const ms = SP.msToUkMidnight(), t = SP.hms(ms);
    $$("[data-to-midnight]").forEach(el => { el.textContent = t; });
    if (S && ms > lastMs + 60000) refresh();   // 过了英国午夜：新的一天
    lastMs = ms;
  }
})();
