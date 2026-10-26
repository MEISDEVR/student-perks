/* 羊毛游乐场（games.html）：小羊跳跳、品牌翻翻乐、今日羊毛问答。
   分数在前端算，羊毛由后端 game_finish() 按规则结算（每天上限 10，见 supabase/quests.sql）；没登录也能玩，只是不换羊毛。 */
(function () {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = SP.esc, W = SP.wool, ico = SP.ico;
  const stage = $("[data-stage]"), body = $("[data-stage-body]"), scoreEl = $("[data-stage-score]");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sp-g-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sp-g-" + k, JSON.stringify(v)); } catch (e) {} },
  };
  let user = null, today = 0, stop = null;
  const CAP = 10;

  $$("[data-wool-deco]").forEach(el => { el.innerHTML = W(); });

  // ---------- 登录状态和今日羊毛 ----------
  async function status() {
    const box = $("[data-status]");
    if (!user) {
      box.innerHTML = `<a class="btn" href="bounty.html">登录后玩游戏攒羊毛</a><span class="muted">不登录也能玩，只是不换羊毛</span>`;
      return;
    }
    const { data } = await SP.sb.from("game_plays").select("reward").eq("day", SP.ukToday());
    today = (data || []).reduce((a, r) => a + r.reward, 0);
    box.innerHTML = `<div class="arc-meter"><span class="mono">今日游戏羊毛</span><b>${today}<small>/${CAP}</small></b>${W()}</div>
      <span class="meter"><i style="width:${today / CAP * 100}%"></i></span>
      <span class="muted">${today >= CAP ? "今天的羊毛拿满了，还可以接着玩刷最高分" : `还能再赚 ${CAP - today} 羊毛`}</span>`;
  }
  function bests() {
    $("[data-best=jump]").textContent = store.get("jump", 0) || "—";
    $("[data-best=memory]").textContent = store.get("memory", 0) || "—";
    const q = store.get("quiz", null);
    $("[data-quiz-state]").textContent = q && q.day === SP.ukToday() ? `今天答对 ${q.n}/3` : "今天还没答";
  }
  SP.user.then(u => { user = u; status(); });
  bests();

  // 结算：返回结果卡里那一行字
  async function settle(game, score, el) {
    if (!user) return `<a class="btn sm" href="bounty.html">登录</a><span>登录后玩，这局能换羊毛</span>`;
    const { data, error } = await SP.sb.rpc("game_finish", { g: game, score });
    if (error || !data) return `<span>羊毛没结算上，稍后再试</span>`;
    if (!data.ok) return `<span>${{ already: "今天的问答羊毛已经领过了", plays: "今天玩得够多啦，明天再来" }[data.reason] || "这局没换到羊毛"}</span>`;
    today = data.today;
    status();
    (data.badges || []).forEach((c, i) => setTimeout(() => {
      const b = SP.badge(c);
      SP.toast(`${ico(b.icon)}<b>解锁成就</b><span>${esc(b.title)}${b.reward ? ` +${b.reward}` : ""}</span>`, "badge");
    }, 900 + i * 500));
    if (data.reward > 0) {
      setTimeout(() => { SP.burst(el, null, Math.min(8, data.reward * 2)); SP.gain(data.reward, "游戏羊毛"); }, 200);
      return `<span class="r-gain">${W()}<b>+${data.reward}</b> 羊毛到账 · 今日 ${data.today}/${CAP}</span>`;
    }
    return `<span>${data.today >= CAP ? "今天的游戏羊毛已经拿满 10 个" : "这局分数不够换羊毛，再来一局"}</span>`;
  }

  // ---------- 舞台（弹窗） ----------
  const GAMES = { jump: ["小羊跳跳", jump], memory: ["品牌翻翻乐", memory], quiz: ["今日羊毛问答", quiz] };
  function open(name) {
    const [title, fn] = GAMES[name];
    $("[data-stage-title]").textContent = title;
    stage.className = "gstage s-" + name;
    scoreEl.textContent = "";
    if (!stage.open) stage.showModal();
    if (stop) stop();
    stop = fn() || null;
  }
  function close() { if (stop) stop(); stop = null; body.innerHTML = ""; if (stage.open) stage.close(); bests(); if (location.hash) history.replaceState(null, "", location.pathname); }
  $$("[data-play]").forEach(b => b.addEventListener("click", () => open(b.dataset.play)));
  $("[data-stage-close]").addEventListener("click", close);
  stage.addEventListener("cancel", e => { e.preventDefault(); close(); });
  stage.addEventListener("click", e => { if (e.target === stage) close(); });
  const fromHash = () => { const h = location.hash.slice(1); if (GAMES[h]) open(h); };
  addEventListener("hashchange", fromHash);
  fromHash();

  function result(html) {
    const r = document.createElement("div");
    r.className = "result";
    r.innerHTML = `<div class="result-card">${html}</div>`;
    body.append(r);
    return r;
  }

  // ---------- 小羊跳跳 ----------
  function jump() {
    body.innerHTML = `<div class="jump-wrap"><canvas class="jump-cv" aria-label="小羊跳跳游戏画面"></canvas>
      <div class="jump-hint" data-hint>${ico("jump")}<b>点屏幕或按空格起跳</b><span>按住跳得更高 · 捡羊毛球 +50</span></div></div>`;
    const cv = $(".jump-cv", body), ctx = cv.getContext("2d"), hint = $("[data-hint]", body);
    const css = getComputedStyle(document.documentElement), C = n => css.getPropertyValue(n).trim();
    const col = { paper: C("--paper"), ink: C("--ink"), line: C("--line"), yellow: C("--yellow"), cobalt: C("--cobalt"), tomato: C("--tomato"), mint: C("--mint"), surface: C("--surface") };
    const sheep = new Image(); sheep.src = "assets/logo.svg";
    let Wd, H, G, dpr, raf, last, state = "ready", t = 0, score = 0, speed, sh, obs, wools, clouds, spawnIn, woolIn, shake = 0, holding = false;
    const best = store.get("jump", 0);

    function size() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      Wd = cv.clientWidth; H = cv.clientHeight; G = H - 34;
      cv.width = Wd * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function reset() {
      score = 0; speed = 6.2; t = 0;
      sh = { x: Math.max(48, Wd * .12), y: 0, vy: 0, s: 56, air: false, squash: 0 };
      obs = []; wools = []; spawnIn = 60; woolIn = 120;
      clouds = Array.from({ length: 4 }, (_, i) => ({ x: i * Wd / 3 + Math.random() * 80, y: 24 + Math.random() * (H * .3), r: 14 + Math.random() * 10 }));
    }
    function press() {
      if (state === "ready") { state = "run"; hint.hidden = true; }
      if (state !== "run") return;
      if (!sh.air) { sh.vy = -13.2; sh.air = true; holding = true; }
    }
    const kd = e => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); if (!e.repeat) press(); } };
    const ku = e => { if (e.code === "Space" || e.code === "ArrowUp") holding = false; };
    const pd = e => { e.preventDefault(); press(); };
    const pu = () => { holding = false; };
    addEventListener("keydown", kd); addEventListener("keyup", ku);
    cv.addEventListener("pointerdown", pd); addEventListener("pointerup", pu);
    hint.addEventListener("pointerdown", pd);
    const ro = new ResizeObserver(() => { size(); if (state !== "run") draw(); });
    ro.observe(cv);

    function spawn() {
      const r = Math.random(), late = score > 400;
      if (late && r < .22) obs.push({ k: "sale", x: Wd + 20, w: 76, h: 28, y: G - 98 });
      else if (r < .55) obs.push({ k: "tag", x: Wd + 20, w: 32, h: 44, y: G - 44 });
      else if (r < .8) obs.push({ k: "cart", x: Wd + 20, w: 60, h: 40, y: G - 40 });
      else obs.push({ k: "tag", x: Wd + 20, w: 32, h: 44, y: G - 44 }, { k: "tag", x: Wd + 56, w: 32, h: 52, y: G - 52 });
      spawnIn = (58 + Math.random() * 62) * (6.2 / speed) + 26;
    }
    function step(k) {
      t += k;
      speed = Math.min(14, 6.2 + t * .0024);
      score += speed * .09 * k;
      // 小羊
      sh.vy += (holding && sh.vy < 0 ? .5 : .95) * k;
      sh.y = Math.min(0, sh.y + sh.vy * k);
      if (sh.y === 0 && sh.air) { sh.air = false; sh.vy = 0; sh.squash = 1; }
      sh.squash = Math.max(0, sh.squash - .08 * k);
      // 障碍和羊毛
      if ((spawnIn -= k) <= 0) spawn();
      if ((woolIn -= k) <= 0) { wools.push({ x: Wd + 20, y: G - (Math.random() < .5 ? 64 : 128), r: 13, a: 0 }); woolIn = 90 + Math.random() * 160; }
      obs.forEach(o => { o.x -= speed * k; });
      wools.forEach(w => { w.x -= speed * k; w.a += .08 * k; });
      obs = obs.filter(o => o.x + o.w > -20);
      wools = wools.filter(w => w.x > -30 && !w.got);
      clouds.forEach(c => { c.x -= speed * .15 * k; if (c.x < -60) { c.x = Wd + 40; c.y = 24 + Math.random() * (H * .3); } });
      // 碰撞（判定框比图小一圈，手感宽松）
      const bx = sh.x + 11, by = G - sh.s + sh.y + 12, bw = sh.s - 22, bh = sh.s - 16;
      for (const o of obs) if (bx < o.x + o.w - 4 && bx + bw > o.x + 4 && by < o.y + o.h - 2 && by + bh > o.y + 4) return over();
      for (const w of wools) if (Math.hypot(sh.x + sh.s / 2 - w.x, G - sh.s / 2 + sh.y - w.y) < w.r + 24) { w.got = true; score += 50; pop(w.x, w.y); }
      scoreEl.textContent = String(Math.floor(score)).padStart(5, "0");
    }
    const pops = [];
    function pop(x, y) { pops.push({ x, y, l: 1 }); }

    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
    function draw() {
      const sx = shake ? (Math.random() - .5) * shake : 0;
      ctx.save(); ctx.translate(sx, 0);
      ctx.fillStyle = col.paper; ctx.fillRect(-10, 0, Wd + 20, H);
      // 远景：格拉斯哥天际线
      ctx.fillStyle = col.ink; ctx.globalAlpha = .07;
      const off = (t * speed * .25) % 240;
      for (let i = -1; i < Wd / 60 + 3; i++) {
        const x = i * 60 - off % 60, k = (i + Math.floor(off / 60)) % 7, h = [70, 40, 95, 55, 120, 45, 80][(k + 7) % 7];
        ctx.fillRect(x, G - h, 52, h);
        if (h === 120) { ctx.beginPath(); ctx.moveTo(x + 18, G - h); ctx.lineTo(x + 26, G - h - 36); ctx.lineTo(x + 34, G - h); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      // 云
      clouds.forEach(c => {
        ctx.fillStyle = col.surface; ctx.strokeStyle = col.line; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, Math.PI, 0); ctx.arc(c.x + c.r * 1.3, c.y - c.r * .3, c.r * .9, Math.PI * 1.1, 0); ctx.arc(c.x + c.r * 2.4, c.y, c.r * .8, Math.PI * 1.2, 0); ctx.closePath(); ctx.stroke(); ctx.fill();
      });
      // 地面
      ctx.fillStyle = col.line; ctx.fillRect(0, G, Wd, 3);
      ctx.fillStyle = col.ink; ctx.globalAlpha = .3;
      for (let x = -(t * speed) % 34; x < Wd; x += 34) ctx.fillRect(x, G + 12, 14, 3);
      ctx.globalAlpha = 1;
      // 羊毛球
      wools.forEach(w => {
        ctx.save(); ctx.translate(w.x, w.y + Math.sin(w.a) * 4); ctx.rotate(w.a * .3);
        ctx.fillStyle = col.yellow; ctx.strokeStyle = "#141414"; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 11; i++) { const a = i / 11 * Math.PI * 2, m = (i - .5) / 11 * Math.PI * 2; i ? ctx.quadraticCurveTo(Math.cos(m) * w.r * 1.22, Math.sin(m) * w.r * 1.22, Math.cos(a) * w.r, Math.sin(a) * w.r) : ctx.moveTo(w.r, 0); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      });
      // 障碍
      obs.forEach(o => {
        ctx.lineWidth = 2.5; ctx.strokeStyle = "#141414";
        if (o.k === "tag") {
          ctx.fillStyle = col.tomato; rr(o.x, o.y, o.w, o.h, 6); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y + 8, 3, 0, 7); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = "800 18px " + C("--font-display"); ctx.textAlign = "center"; ctx.fillText("£", o.x + o.w / 2, o.y + o.h - 9);
        } else if (o.k === "cart") {
          ctx.fillStyle = col.cobalt; rr(o.x + 4, o.y + 4, o.w - 8, o.h - 16, 4); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(o.x - 4, o.y); ctx.lineTo(o.x + 4, o.y + 4); ctx.stroke();
          ctx.fillStyle = "#141414"; [o.x + 14, o.x + o.w - 14].forEach(x => { ctx.beginPath(); ctx.arc(x, o.y + o.h - 6, 6, 0, 7); ctx.fill(); });
          ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2;
          for (let x = o.x + 14; x < o.x + o.w - 8; x += 10) { ctx.beginPath(); ctx.moveTo(x, o.y + 8); ctx.lineTo(x, o.y + o.h - 16); ctx.stroke(); }
        } else {
          ctx.fillStyle = col.yellow; rr(o.x, o.y, o.w, o.h, 6); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#141414"; ctx.font = "800 15px " + C("--font-display"); ctx.textAlign = "center"; ctx.fillText("SALE", o.x + o.w / 2, o.y + 19);
          ctx.beginPath(); ctx.moveTo(o.x + 12, o.y); ctx.lineTo(o.x + 12, o.y - 14); ctx.moveTo(o.x + o.w - 12, o.y); ctx.lineTo(o.x + o.w - 12, o.y - 14); ctx.stroke();
        }
      });
      // 小羊（落地压扁、空中前倾）
      if (sheep.complete) {
        const s = sh.s, q = sh.squash * .18;
        ctx.save(); ctx.translate(sh.x + s / 2, G + sh.y); ctx.rotate(sh.air ? Math.max(-.35, sh.vy * .02) : Math.sin(t * .5) * .04);
        ctx.scale(1 + q, 1 - q); ctx.drawImage(sheep, -s / 2, -s, s, s); ctx.restore();
        if (!sh.air && state === "run") { ctx.fillStyle = col.ink; ctx.globalAlpha = .18; ctx.beginPath(); ctx.ellipse(sh.x + s / 2, G + 2, s * .38, 4, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      }
      pops.forEach(p => { ctx.globalAlpha = p.l; ctx.fillStyle = col.ink; ctx.font = "800 18px " + C("--font-display"); ctx.textAlign = "center"; ctx.fillText("+50", p.x, p.y - (1 - p.l) * 30); p.l -= .03; });
      ctx.globalAlpha = 1;
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].l <= 0) pops.splice(i, 1);
      ctx.restore();
    }
    function loop(now) {
      const k = Math.min(3, (now - (last || now)) / 16.67);
      last = now;
      if (state === "run") step(k);
      if (shake) shake = Math.max(0, shake - .8);
      draw();
      raf = requestAnimationFrame(loop);
    }
    async function over() {
      state = "over"; shake = 10; holding = false;
      const s = Math.floor(score), nb = s > best;
      if (nb) store.set("jump", s);
      const r = result(`<span class="eyebrow">GAME OVER</span><div class="r-big mono">${s}</div>
        <p>${nb ? "新纪录！" : `最高 ${Math.max(best, s)}`}</p><div class="r-line" data-r>结算中…</div>
        <div class="r-act"><button class="btn" type="button" data-again>${ico("jump")}再跑一局</button></div>`);
      $("[data-again]", r).onclick = () => { r.remove(); reset(); state = "run"; };
      $("[data-r]", r).innerHTML = await settle("jump", s, $(".r-big", r));
    }
    size(); reset(); draw();
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      removeEventListener("keydown", kd); removeEventListener("keyup", ku); removeEventListener("pointerup", pu);
    };
  }

  // ---------- 品牌翻翻乐 ----------
  const BRANDS = [["tesco.png", "Tesco"], ["asda.svg", "Asda"], ["lidl.svg", "Lidl"], ["mcdonalds.svg", "McDonald's"], ["kfc.svg", "KFC"], ["greggs.png", "Greggs"],
    ["boots.svg", "Boots"], ["argos.svg", "Argos"], ["currys.png", "Currys"], ["johnlewis.png", "John Lewis"], ["uniqlo.svg", "Uniqlo"], ["zara.svg", "Zara"],
    ["nike.svg", "Nike"], ["adidas.svg", "adidas"], ["lego.svg", "LEGO"], ["apple.svg", "Apple"], ["amazon.svg", "Amazon"], ["sainsburys.png", "Sainsbury's"],
    ["coop.svg", "Co-op"], ["toogoodtogo.png", "Too Good To Go"], ["railcard.svg", "Railcard"], ["ryanair.svg", "Ryanair"], ["lookfantastic.png", "Lookfantastic"]];
  function memory() {
    const pick = BRANDS.slice().sort(() => Math.random() - .5).slice(0, 8);
    const deck = pick.concat(pick).map((b, i) => ({ b, i })).sort(() => Math.random() - .5);
    body.innerHTML = `<div class="mem"><div class="mem-bar"><span>步数 <b class="mono" data-moves>0</b></span><span>配对 <b class="mono" data-pairs>0</b>/8</span><span>${ico("clock")}<b class="mono" data-time>0:00</b></span></div>
      <div class="mem-grid">${deck.map((c, n) => `<button class="mc" type="button" data-n="${n}" aria-label="翻开第 ${n + 1} 张">
        <span class="mc-in"><span class="mc-back"><img src="assets/logo.svg" alt="" width="44" height="44"></span>
        <span class="mc-front"><img src="assets/brands/${c.b[0]}" alt="" loading="eager"><small>${esc(c.b[1])}</small></span></span></button>`).join("")}</div></div>`;
    let open = [], moves = 0, pairs = 0, t0 = 0, timer, lock = false;
    const best = store.get("memory", 0);
    const tick = () => { const s = Math.floor((Date.now() - t0) / 1000); $("[data-time]", body).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    body.querySelector(".mem-grid").addEventListener("click", async e => {
      const b = e.target.closest(".mc");
      if (!b || lock || b.classList.contains("up")) return;
      if (!t0) { t0 = Date.now(); timer = setInterval(tick, 500); }
      b.classList.add("up"); open.push(b);
      if (open.length < 2) return;
      moves++; $("[data-moves]", body).textContent = moves; scoreEl.textContent = moves + " 步";
      const [x, y] = open; open = [];
      if (deck[x.dataset.n].b === deck[y.dataset.n].b) {
        pairs++; $("[data-pairs]", body).textContent = pairs;
        setTimeout(() => { x.classList.add("got"); y.classList.add("got"); }, 250);
        if (pairs === 8) {
          clearInterval(timer);
          const stars = moves <= 12 ? 3 : moves <= 16 ? 2 : 1, nb = !best || moves < best;
          if (nb) store.set("memory", moves);
          setTimeout(async () => {
            const r = result(`<span class="eyebrow">CLEAR!</span><div class="r-stars">${[1, 2, 3].map(i => ico("star", i <= stars ? "on" : "")).join("")}</div>
              <p>${moves} 步 · ${$("[data-time]", body).textContent}${nb ? " · 新纪录！" : ""}</p><div class="r-line" data-r>结算中…</div>
              <div class="r-act"><button class="btn" type="button" data-again>${ico("cards")}再来一局</button></div>`);
            $("[data-again]", r).onclick = () => { stop = memory() || null; };
            $("[data-r]", r).innerHTML = await settle("memory", stars, $(".r-stars", r));
          }, 600);
        }
      } else {
        lock = true;
        setTimeout(() => { x.classList.add("no"); y.classList.add("no"); }, 350);
        setTimeout(() => { x.classList.remove("up", "no"); y.classList.remove("up", "no"); lock = false; }, 900);
      }
    });
    return () => clearInterval(timer);
  }

  // ---------- 今日羊毛问答 ----------
  function todays() {
    const day = SP.ukToday();
    let h = 0;
    for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const idx = window.QUIZ.map((_, i) => i), out = [];
    while (out.length < 3) { h = (h * 1103515245 + 12345) >>> 0; out.push(idx.splice(h % idx.length, 1)[0]); }
    return out.map(i => window.QUIZ[i]);
  }
  function quiz() {
    const qs = todays(), done = store.get("quiz", null), day = SP.ukToday();
    let i = 0, right = 0;
    if (done && done.day === day) { summary(done.n, true); return; }
    function show() {
      const q = qs[i];
      scoreEl.textContent = `${i + 1}/3`;
      body.innerHTML = `<div class="qz"><div class="qz-dots">${qs.map((_, n) => `<i class="${n < i ? "past" : n === i ? "now" : ""}"></i>`).join("")}</div>
        <h3 class="qz-q">${esc(q.q)}</h3>
        <div class="qz-o">${q.o.map((o, n) => `<button type="button" data-o="${n}"><span class="mono">${"ABCD"[n]}</span>${esc(o)}</button>`).join("")}</div>
        <div class="qz-e" data-e hidden></div></div>`;
      $$("[data-o]", body).forEach(b => b.addEventListener("click", () => answer(+b.dataset.o)));
    }
    function answer(n) {
      const q = qs[i], ok = n === q.a;
      if (ok) right++;
      $$("[data-o]", body).forEach(b => { b.disabled = true; const k = +b.dataset.o; if (k === q.a) b.classList.add("ok"); else if (k === n) b.classList.add("bad"); });
      const e = $("[data-e]", body);
      e.hidden = false;
      e.innerHTML = `<b>${ok ? "答对了！" : "差一点"}</b><p>${esc(q.e)}</p><div class="qz-act"><a href="${esc(q.l)}">去看原文 →</a>
        <button class="btn" type="button" data-next>${i < 2 ? "下一题" : "看结果"}</button></div>`;
      $("[data-next]", body).onclick = () => { i++; if (i < 3) show(); else { store.set("quiz", { day, n: right }); summary(right, false); } };
    }
    async function summary(n, again) {
      scoreEl.textContent = `${n}/3`;
      body.innerHTML = `<div class="qz qz-end"><span class="eyebrow">${again ? "今天已经答过了" : "今日结果"}</span>
        <div class="r-big mono">${n}<small>/3</small></div><div class="r-stars">${[0, 1, 2].map(k => ico("star", k < n ? "on" : "")).join("")}</div>
        <p>${n === 3 ? "全对！羊毛学霸就是你" : n ? "还不错，答案页面都在下面" : "今天的题有点难，看看原文涨知识"}</p>
        <ul class="qz-review">${qs.map(q => `<li><b>${esc(q.q)}</b><span>${esc(q.o[q.a])}</span><a href="${esc(q.l)}">原文 →</a></li>`).join("")}</ul>
        <div class="r-line" data-r>${again ? "" : "结算中…"}</div>
        <p class="muted">明天的新题还有 <b class="mono" data-qz-left>${SP.hms(SP.msToUkMidnight())}</b></p></div>`;
      if (!again) $("[data-r]", body).innerHTML = await settle("quiz", n, $(".r-big", body));
      const t = setInterval(() => { const el = $("[data-qz-left]", body); if (el) el.textContent = SP.hms(SP.msToUkMidnight()); else clearInterval(t); }, 1000);
    }
    show();
  }
})();
