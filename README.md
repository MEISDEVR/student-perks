# 学生优惠地图

海外在读学生可申请的软件、云服务、设备和订阅优惠导航。只收录官方优惠，链接直达官方申请页。

线上地址：https://sheeperks.com/

## 更新内容

1. 编辑 `source/deals.js`（每条优惠一个对象；加 `featured` 字段即进入首页精选；`icon` 填 `source/icons.js` 里的品牌 key，或 `mono:字母:底色` 字母标）。
2. 运行 `python3 source/build.py https://sheeperks.com/`，生成 `docs/`。
3. 提交并推送，GitHub Pages 从 `main` 分支的 `/docs` 目录发布。

独立专题页（如 `source/black-friday.html` 英国黑五专区）是静态 HTML，直接改文件内容；新增专题页时把文件名加进 `build.py` 的 `EXTRA_PAGES`，会一并输出到 `docs/` 并写进 sitemap。

构建需要 Python 3 和 Node。
