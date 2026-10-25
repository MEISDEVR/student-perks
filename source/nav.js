/* 顶栏吸顶：滚动后加底线；手机上往下滚收起、往上滚出现。
   顶栏高度写进 --topbar-h，给锚点跳转留白和首页筛选条吸在顶栏下面用。 */
(function () {
  const bar = document.querySelector(".topbar");
  if (!bar) return;
  const root = document.documentElement;
  const phone = matchMedia("(max-width: 640px)");
  let lastY = scrollY, turnY = scrollY, hidden = false;

  const setH = () => root.style.setProperty("--topbar-h", bar.offsetHeight + "px");
  new ResizeObserver(setH).observe(bar);
  setH();

  function hide(v) {
    if (v === hidden) return;
    hidden = v;
    bar.classList.toggle("off", v);
    root.classList.toggle("topbar-off", v);
  }
  function onScroll() {
    const y = scrollY;
    bar.classList.toggle("stuck", y > 4);
    if ((y > lastY) !== (lastY > turnY)) turnY = lastY;  // 换方向时记下拐点
    if (!phone.matches || y < bar.offsetHeight || root.classList.contains("modal-open")) hide(false);
    else if (y - turnY > 40) hide(true);
    else if (turnY - y > 40) hide(false);
    lastY = y;
  }
  addEventListener("scroll", onScroll, { passive: true });
  phone.addEventListener("change", onScroll);
  bar.addEventListener("focusin", () => hide(false));
  onScroll();
})();

/* 导航里的「登录」：已登录（Supabase 会话在 localStorage）时换成头像首字 + 昵称，不用加载 SDK */
(function () {
  const a = document.querySelector(".acct");
  if (!a) return;
  try {
    const s = JSON.parse(localStorage.getItem("sheeperks-auth") || "null");
    const u = s && s.user;
    if (!u) return;
    const name = localStorage.getItem("sp-nick") || (u.email || u.phone || "我").split("@")[0];
    a.classList.add("in");
    a.dataset.i = [...name][0].toUpperCase();
    a.querySelector("span").textContent = name;
    a.setAttribute("aria-label", "我的档案");
  } catch (e) {}
})();
