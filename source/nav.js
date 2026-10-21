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
