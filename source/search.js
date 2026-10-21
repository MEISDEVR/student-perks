/* 全站搜索：导航里的 .sbox 打开弹层，索引 search-index.json 由 build.py 生成（首次打开才加载）。
   结果链到 页面#元素id；目标在隐藏的 tab 里时先点开对应 tab，再滚过去闪一下。 */
(function () {
  const HOT = ["Apple", "Railcard", "Dyson", "退货", "Tesco", "麦当劳", "比斯特", "学生折扣", "Spotify"];
  const here = location.pathname.split("/").pop() || "index.html";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let idx = null, loading = null, dlg, input, body, sel = 0, hits = [];

  function load() {
    return loading || (loading = fetch("search-index.json").then(r => r.json()).then(d => { idx = d; }).catch(() => { idx = { i: [] }; }));
  }

  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "sdlg";
    dlg.setAttribute("aria-label", "搜索全站优惠");
    dlg.innerHTML = `<div class="s-head"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="搜品牌、优惠、关键词，例如 Apple、退货、Railcard" autocomplete="off" enterkeyhint="search" aria-label="搜索关键词"><button class="s-x" type="button">ESC</button></div><div class="s-body" role="listbox"></div>`;
    document.body.appendChild(dlg);
    input = dlg.querySelector("input");
    body = dlg.querySelector(".s-body");
    input.addEventListener("input", () => { sel = 0; render(); });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); }
      if (e.key === "Enter") { const a = body.querySelectorAll(".s-list a")[sel]; if (a) { e.preventDefault(); a.click(); } }
    });
    dlg.querySelector(".s-x").addEventListener("click", close);
    dlg.addEventListener("click", e => {
      if (e.target === dlg) return close();
      const h = e.target.closest(".s-hot button");
      if (h) { input.value = h.textContent; sel = 0; render(); input.focus(); return; }
      const a = e.target.closest(".s-list a");
      if (a) go(e, a);
    });
    dlg.addEventListener("close", () => document.documentElement.classList.remove("modal-open"));
  }

  function open(q) {
    if (!dlg) build();
    if (!dlg.open) { dlg.showModal(); document.documentElement.classList.add("modal-open"); }
    if (typeof q === "string") input.value = q;
    input.focus(); input.select();
    render();
    load().then(render);
  }
  function close() { if (dlg && dlg.open) dlg.close(); }

  function move(d) {
    const as = body.querySelectorAll(".s-list a");
    if (!as.length) return;
    sel = (sel + d + as.length) % as.length;
    as.forEach((a, i) => a.classList.toggle("on", i === sel));
    as[sel].scrollIntoView({ block: "nearest" });
  }

  function mark(text, terms) {
    let out = esc(text);
    terms.forEach(t => { if (t) out = out.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`); });
    return out;
  }
  function snippet(text, terms) {
    const low = text.toLowerCase();
    let at = -1;
    for (const t of terms) { at = low.indexOf(t); if (at >= 0) break; }
    if (at < 0) return text.slice(0, 80);
    const s = Math.max(0, at - 24);
    return (s > 0 ? "…" : "") + text.slice(s, s + 90) + (s + 90 < text.length ? "…" : "");
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      body.innerHTML = `<div class="s-meta">热门搜索</div><div class="s-hot">${HOT.map(h => `<button type="button">${esc(h)}</button>`).join("")}</div><div class="s-meta">可以搜品牌名、品类（耳机、床垫）、规则（退货、叠加）和城市（格拉斯哥）。</div>`;
      return;
    }
    if (!idx) { body.innerHTML = `<div class="s-empty">加载中…</div>`; return; }
    const terms = q.split(/\s+/).filter(Boolean);
    hits = [];
    for (const it of idx.i) {
      const [url, pg, title, sec, text] = it;
      const t = title.toLowerCase(), s = sec.toLowerCase(), x = text.toLowerCase();
      let score = 0, ok = true;
      for (const term of terms) {
        const inT = t.includes(term), inS = s.includes(term), inX = x.includes(term);
        if (!inT && !inS && !inX) { ok = false; break; }
        score += (inT ? 10 : 0) + (t === term ? 8 : 0) + (t.startsWith(term) ? 5 : 0) + (inS ? 3 : 0) + (inX ? 1 : 0);
      }
      if (!ok) continue;
      if (url.split(/[?#]/)[0] === here || (here === "index.html" && url.startsWith("./"))) score += 2;
      hits.push({ url, pg, title, sec, text, score });
    }
    hits.sort((a, b) => b.score - a.score);
    const shown = hits.slice(0, 40);
    if (!shown.length) { body.innerHTML = `<div class="s-empty">没找到「${esc(q)}」。换个说法试试，比如品牌英文名或品类。</div>`; return; }
    body.innerHTML = `<div class="s-meta">找到 ${hits.length} 条${hits.length > 40 ? "，显示前 40 条" : ""} · ↑↓ 选择，回车打开</div><ul class="s-list">${shown.map((h, i) =>
      `<li><a href="${esc(h.url)}" role="option"${i === sel ? ' class="on"' : ""}><span class="pg p${idx.p.indexOf(h.pg)}">${esc(h.pg)}</span><b>${mark(h.title, terms)}${h.sec ? `<small>${esc(h.sec)}</small>` : ""}</b><p>${mark(snippet(h.text, terms), terms)}</p></a></li>`).join("")}</ul>`;
  }

  // 同页结果不刷新，直接定位
  function go(e, a) {
    const u = new URL(a.href, location.href);
    const samePage = u.pathname === location.pathname && u.search === location.search;
    if (!samePage || !u.hash) return close();
    e.preventDefault();
    close();
    history.replaceState(null, "", u.hash);
    reveal(u.hash.slice(1));
  }

  function reveal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const panel = el.closest('[role="tabpanel"]');
    if (panel && panel.hidden) {
      const tab = document.querySelector(`[aria-controls="${panel.id}"]`);
      if (tab) { tab.click(); history.replaceState(null, "", "#" + id); }
    }
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    });
  }

  document.addEventListener("click", e => { if (e.target.closest("[data-search]")) { e.preventDefault(); open(); } });
  document.addEventListener("keydown", e => {
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); open(); }
    else if (e.key === "/" && here !== "index.html" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); open(); }
  });
  const ANCHOR = /^#(s\d+|p-[\w-]+)$/;  // p-* 是手写的固定锚点（首页跑马灯链过来）
  if (ANCHOR.test(location.hash)) {
    const run = () => reveal(location.hash.slice(1));
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", run) : run();
  }
  window.addEventListener("hashchange", () => { if (ANCHOR.test(location.hash)) reveal(location.hash.slice(1)); });
  window.openSiteSearch = open;
})();
