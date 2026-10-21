// 限时卡片（.lim 里的票根）：按英国当天日期算「还剩 N 天 / N 天后开始 / 今天可用」，上架 7 天内标 NEW。
// 穷鬼专区：过期的标「已过期」排到最后，过期 14 天后隐藏。
// 首页「本周羊毛」（data-feed）：过期的直接下架，其余按紧急程度排序，桌面只露前 6 张，手机横滑看全部。
(function () {
  var today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  var day = function (s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5; };
  var t = day(today), wd = (t + 4) % 7 || 7; // 1970-01-01 是周四；周一=1…周日=7
  [].forEach.call(document.querySelectorAll(".lim"), function (grid) {
    var feed = grid.hasAttribute("data-feed"), cards = [].slice.call(grid.children), live = [];
    cards.forEach(function (el, i) {
      var d = el.dataset, pill = el.querySelector(".pill.left"), stub = el.querySelector(".stub"), key = 1000 + i;
      if (d.added && t - day(d.added) >= 0 && t - day(d.added) <= 7) el.classList.add("is-new");
      if (d.start && day(d.start) > t) {
        var s = day(d.start) - t;
        pill.textContent = s === 1 ? "明天开始" : s + " 天后开始";
        key = s + .5; // 快开始的排在后面截止的前面
      } else if (d.end) {
        var n = day(d.end) - t;
        if (n < 0) {
          if (feed || n < -14) { el.hidden = true; return; }
          el.classList.add("expired"); pill.textContent = "已过期"; grid.appendChild(el); return;
        }
        pill.textContent = n === 0 ? "今天截止" : "还剩 " + n + " 天";
        if (n <= 7) pill.classList.add("hot");
        if (stub && stub.dataset.endstub) { // 已开始的活动：票根从开始日期换成截止日期
          stub.className = "stub deal";
          stub.innerHTML = "<b>" + stub.dataset.endstub + "</b><span>截止</span>";
        }
        key = n;
      } else if (d.weekday) {
        var k = (+d.weekday - wd + 7) % 7;
        if (k === 0) { pill.textContent = "今天可用"; pill.classList.add("hot"); }
        else pill.textContent = k === 1 ? "明天可用" : "下次：" + new Date((t + k) * 864e5).toISOString().slice(5, 10);
        key = k;
      }
      el._key = key;
      live.push(el);
    });
    if (!feed) return;
    live.sort(function (a, b) { return a._key - b._key; });
    live.forEach(function (el, i) { grid.appendChild(el); el.classList.toggle("extra", i >= 6); });
    var btn = document.querySelector("[data-feed-more]");
    if (btn && live.length > 6) {
      btn.hidden = false;
      btn.textContent = "展开全部 " + live.length + " 条";
      btn.addEventListener("click", function () { grid.classList.add("open"); btn.hidden = true; });
    }
    var cnt = document.querySelector("[data-feed-count]");
    if (cnt) cnt.textContent = live.length;
  });
})();
