/* 账号公共层：account.html 和 games.html 共用。
   建 Supabase 客户端（window.SP.sb）、等级表、英国日期、图标、羊毛到账动画。后端函数见 supabase/quests.sql。 */
(function () {
  const C = window.SP_AUTH || {};
  const SP = window.SP = { on: !!(C.url && C.key && window.supabase) };
  if (SP.on) SP.sb = window.supabase.createClient(C.url, C.key, { auth: { storageKey: "sheeperks-auth", detectSessionInUrl: true } });

  // 当前登录用户：第一次 auth 事件到了才确定
  SP.user = new Promise(res => {
    if (!SP.on) return res(null);
    const { data } = SP.sb.auth.onAuthStateChange((ev, s) => { res(s && s.user || null); setTimeout(() => data.subscription.unsubscribe()); });
  });

  // 等级按累计获得的羊毛算，门槛和 quests.sql 的 wool_level() 一致
  SP.LEVELS = [[0, "小羊羔"], [50, "卷毛羊"], [150, "薅毛学徒"], [400, "羊毛猎人"], [900, "牧场老手"], [2000, "金羊毛"]];
  SP.level = earned => {
    let i = SP.LEVELS.length - 1;
    while (earned < SP.LEVELS[i][0]) i--;
    const [floor, name] = SP.LEVELS[i], nx = SP.LEVELS[i + 1];
    return { lv: i + 1, name, floor, next: nx ? nx[0] : null, nextName: nx ? nx[1] : null,
             pct: nx ? Math.min(100, Math.round((earned - floor) / (nx[0] - floor) * 100)) : 100 };
  };

  SP.ukToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  // 离英国时间今晚 24:00 还有多少毫秒
  SP.msToUkMidnight = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour12: false, hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date()).map(x => [x.type, +x.value]));
    return ((23 - p.hour % 24) * 3600 + (59 - p.minute) * 60 + (60 - p.second)) * 1000;
  };
  SP.hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, s / 60 % 60, s % 60].map(n => String(Math.floor(n)).padStart(2, "0")).join(":"); };
  SP.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 羊毛球：和 LOGO 一样的齿边圆
  const scallop = (r, n, k) => {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2 - Math.PI / 2, m = (i - .5) / n * Math.PI * 2 - Math.PI / 2;
      const x = 12 + r * Math.cos(a), y = 12 + r * Math.sin(a);
      d += i ? `Q${(12 + r * k * Math.cos(m)).toFixed(2)} ${(12 + r * k * Math.sin(m)).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}` : `M${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d + "Z";
  };
  SP.SCALLOP = scallop(9.6, 11, 1.2);
  SP.wool = (cls = "") => `<svg class="wool ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SP.SCALLOP}"/><path class="wool-curl" d="M12.4 12.3a.9.9 0 1 1-1.3.9 2.1 2.1 0 1 1 3.4-2.1 3.4 3.4 0 1 1-6 2.6"/></svg>`;

  const I = {
    flame: "M12 2.5c2.2 3.8 6 6 6 11a6 6 0 0 1-12 0c0-2.7 1.6-4.4 2.8-5.8.4 1.9 1.4 3 2.7 3.2-.9-2.8-.6-5.6.5-8.4Z",
    calendar: "M4 5.5h16v15H4zM4 10h16M8.5 3v4M15.5 3v4",
    card: "M3 5.5h18v13H3zM6.5 10h5M6.5 14h7.5M16.5 10.5h.01",
    gamepad: "M7 8h10a4.5 4.5 0 0 1 4.3 5.8l-.7 2.3a2.4 2.4 0 0 1-4.1.9L15 15H9l-1.5 2a2.4 2.4 0 0 1-4.1-.9l-.7-2.3A4.5 4.5 0 0 1 7 8ZM8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01",
    jump: "M12 19V5M6 10.5 12 4.5l6 6M4.5 21h15",
    cards: "M3.5 7.5h10v13h-10zM10 3.5h10.5v13H17",
    bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.9 10.6c.6.6.9 1.4.9 2.4h6c0-1 .3-1.8.9-2.4A6 6 0 0 0 12 3Z",
    target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM12 12h.01",
    trophy: "M7.5 3.5h9v5a4.5 4.5 0 0 1-9 0v-5ZM7.5 5.5H4.5a3 3 0 0 0 3 4M16.5 5.5h3a3 3 0 0 1-3 4M12 13v4M8 20.5h8M9.5 17h5",
    chevrons: "M6 14l6-6 6 6M6 19.5l6-6 6 6",
    crown: "M3.5 18.5h17M4.5 18.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1.5 11",
    smile: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4M9 9.5h.01M15 9.5h.01",
    check: "M5 12.5l4.5 4.5L19 7",
    lock: "M6 10.5h12v10H6zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5",
    gift: "M3.5 8.5h17v4h-17zM5.5 12.5h13v8h-13zM12 8.5v12M12 8.5C10 4.5 6.5 4.5 6.5 6.8S12 8.5 12 8.5s5.5.6 5.5-1.7S14 4.5 12 8.5Z",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3.5 2",
    eye: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    mail: "M3 5.5h18v13H3zM3 6.5l9 6.5 9-6.5",
    camera: "M3.5 8h4l2-3h5l2 3h4v11.5h-17zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
    flask: "M9 3h6M10 3v6.5l-5.2 9.4A1.4 1.4 0 0 0 6 21h12a1.4 1.4 0 0 0 1.2-2.1L14 9.5V3M7.5 15h9",
    arrow: "M5 12h14M13 6l6 6-6 6",
    shop: "M3.5 9 5 4h14l1.5 5M3.5 9h17v11.5h-17zM9.5 20.5v-6h5v6",
    ticket: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14.5 7v10",
    star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.9Z",
    bolt: "M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z",
  };
  SP.ico = (name, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${I[name] || I.star}"/></svg>`;

  // 成就定义：和 quests.sql 的 badges 表一致；后台改了表，hub.js 会以表为准
  SP.BADGES = [
    ["hello", "初来乍到", "注册 Sheeperks 账号", 2, "smile"], ["profile", "档案齐全", "羊毛档案全部填完", 5, "card"],
    ["streak7", "七日不断", "连续签到 7 天", 10, "flame"], ["streak30", "月度坚持", "连续签到 30 天", 50, "calendar"],
    ["gamer10", "游乐场常客", "累计玩 10 局小游戏", 5, "gamepad"], ["jump1000", "跳跳高手", "小羊跳跳单局 1000 分", 10, "jump"],
    ["memory", "过目不忘", "品牌翻翻乐拿到 3 星", 5, "cards"], ["quiz", "羊毛学霸", "5 天问答全对", 10, "bulb"],
    ["bounty1", "第一张悬赏", "第一个悬赏通过审核", 10, "target"], ["bounty5", "赏金猎人", "5 个悬赏通过审核", 30, "trophy"],
    ["lv3", "薅毛学徒", "升到 3 级", 0, "chevrons"], ["lv5", "牧场老手", "升到 5 级", 0, "crown"],
  ].map(([code, title, body, reward, icon], i) => ({ code, title, body, reward, icon, sort: i + 1 }));
  SP.badge = code => SP.BADGES.find(b => b.code === code) || { code, title: code, body: "", icon: "star" };

  // ---------- 提示条和羊毛飞入 ----------
  let tray;
  SP.toast = (html, kind = "") => {
    if (!tray) { tray = document.createElement("div"); tray.className = "toasts"; tray.setAttribute("aria-live", "polite"); document.body.append(tray); }
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.innerHTML = html;
    tray.append(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3100);
  };
  // 从 from 元素飞几团羊毛到 to 元素（没有 to 就往上飘）
  SP.burst = (from, to, n = 6) => {
    if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = from.getBoundingClientRect(), b = to && to.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const w = document.createElement("span");
      w.className = "fly";
      w.innerHTML = SP.wool();
      const x0 = a.left + a.width / 2 + (Math.random() - .5) * a.width * .6, y0 = a.top + a.height / 2;
      const x1 = b ? b.left + b.width / 2 : x0 + (Math.random() - .5) * 160, y1 = b ? b.top + b.height / 2 : y0 - 140 - Math.random() * 60;
      w.style.cssText = `left:${x0}px;top:${y0}px`;
      document.body.append(w);
      const mx = (x0 + x1) / 2 + (Math.random() - .5) * 220, my = Math.min(y0, y1) - 80 - Math.random() * 80;
      w.animate([
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
        { transform: `translate(calc(-50% + ${mx - x0}px), calc(-50% + ${my - y0}px)) scale(1.15)`, opacity: 1, offset: .45 },
        { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(.5)`, opacity: b ? 1 : 0 },
      ], { duration: 820 + i * 70, easing: "cubic-bezier(.3,.7,.4,1)", delay: i * 40, fill: "forwards" }).onfinish = () => {
        w.remove();
        if (b && i === n - 1) { to.classList.remove("pop"); void to.offsetWidth; to.classList.add("pop"); }
      };
    }
  };
  SP.gain = (amount, note) => SP.toast(`${SP.wool()}<b>+${amount}</b><span>${SP.esc(note || "羊毛到账")}</span>`, "gain");
})();
