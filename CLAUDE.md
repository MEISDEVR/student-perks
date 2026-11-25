# Sheeperks 英国羊毛 · 项目规则
面向在英中国留学生的优惠聚合网站（格拉斯哥起步，可能扩到全英），线上 https://sheeperks.com ，GitHub Pages 发布 `docs/`。目标：提高回访留存，做微信群不定期推送的落地页。

## 开工
先读 `STATUS.md` 顶部“当前”块；收工更新 `STATUS.md`。项目记忆（claude.ai 项目「英国优惠地图」）里有更细的历史。

## 定稿
- 构建：`python3 source/build.py https://sheeperks.com/` 生成 `docs/`；源文件只改 `source/`。`.github/workflows/daily-build.yml` 每天 UTC 05:15 重建，自动下架过期内容。
- 时效内容放 `source/weekly.js`（字段说明在文件头）；页面里写死的截止日用 `data-expire`，到期后才显示的用 `data-after` + `hidden`。
- 有时限、每天都能用的券（麦当劳纸质券、App 周券）放穷鬼专区 `budget.html` 顶部「今天就能用」。
- 品牌：Sheeperks 英国羊毛；v2 视觉（黄 #F3E24A / 钴蓝 #2F4BFF / 番茄红 #FF5B39 / 薄荷 #BFE8D2 / 纸色 #F3EFE6 / 墨 #141414）。
- 新页面的 nav 包在 `header.topbar` 里。

## 规范与约束
- 未确认的数字不写；未官宣的标「预计」，官宣后改「已确认」，每条附来源和查询日期。云端多数官网打不开，靠搜索摘要时写明「搜索摘要」。
- 合规：不写“兼职”（学生签证），用“闲置变现”“校内岗位”；返现不收接单/押金/拉人头/刷单。
- 群推送是不定期的，文案不写“每日推送”。
- 改完要 build，并在桌面 1440 + 手机 390 截图检查，截图存 `/mnt/project-files/uk-deals/site/<子文件夹>/`。
- 每次 `git push`、开 PR、合并都要用户当次明确同意（`F:\Claude\CLAUDE.md` Git Safety）；PR 等用户回「合并」再合并。

<!-- skills-list v1 · 2026-11-25 -->
## 本项目用哪些 skill
**每次必调**
- `anthropic-skills:project-memory`：开工读 STATUS，收工写 STATUS

**按任务调**
| 做什么 | 调用 |
| --- | --- |
| 黑五等专题页的标题、描述、FAQ、搜索流量 | `anthropic-skills:seo-growth` |
| 改版、新板块的视觉 | `anthropic-skills:design-workflow` → `anthropic-skills:ui-visual-design` |
| 动效、交互质感 | `anthropic-skills:web-visual-effects`、`anthropic-skills:micro-interactions` |
| 卡片文案、推广文案 | `anthropic-skills:ad-creative-copy` |
| 定位、留存、增长策略 | `anthropic-skills:product-marketing` |
| 小红书 / 微信群推广帖 | `anthropic-skills:social-media-ops`、`anthropic-skills:x-human-voice` |
<!-- /skills-list -->

## 位置
- 仓库 github.com/MEISDEVR/student-perks（本机没有副本，在 claude.ai 云端线程里开发）
- 截图、推广素材：claude.ai 项目文件 `/mnt/project-files/uk-deals/`
