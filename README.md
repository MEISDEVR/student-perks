# 学生优惠地图

海外在读学生可申请的软件、云服务、设备和订阅优惠导航。只收录官方优惠，链接直达官方申请页。

线上地址：https://minchuan-dev.github.io/student-perks/

## 更新内容

1. 编辑 `source/deals.js`（每条优惠一个对象；加 `featured` 字段即进入首页精选）。
2. 运行 `python3 source/build.py https://minchuan-dev.github.io/student-perks/`，生成 `docs/`。
3. 提交并推送，GitHub Pages 从 `main` 分支的 `/docs` 目录发布。

构建需要 Python 3 和 Node。
