#!/usr/bin/env python3
"""把 index.html + deals.js + icons.js + v2.css 构建成可部署的静态站（dist/）。

做的事：补全 <head>（SEO 描述、canonical、Open Graph、JSON-LD），把全部优惠卡片
预先写进 HTML 让搜索引擎能读到，再生成 sitemap.xml、robots.txt。
用法：python3 build.py https://你的域名/ [输出目录，默认 ../docs]
"""
import html, json, os, re, shutil, subprocess, sys

SITE_URL = (sys.argv[1] if len(sys.argv) > 1 else "https://sheeperks.com/").rstrip("/") + "/"
ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "..", "docs"))

TITLE = "学生优惠地图：海外在读学生可申请的软件、云服务与订阅优惠"
DESC = ("汇总 GitHub Student Pack、JetBrains、Azure for Students、Google AI Pro、Notion、Figma、"
        "Spotify、Apple 教育优惠等海外学生优惠，写清资格、验证方式（学校邮箱、SheerID、UNiDAYS、ISIC）和官方申请入口。")

deals_js = open(os.path.join(ROOT, "deals.js"), encoding="utf-8").read()
data = json.loads(subprocess.check_output(
    ["node", "-e", "global.window={};eval(require('fs').readFileSync(0,'utf8'));"
     "process.stdout.write(JSON.stringify({deals:window.DEALS,updated:window.DEALS_UPDATED}))"],
    input=deals_js.encode()))
deals, updated = data["deals"], data["updated"]
e = lambda s: html.escape(str(s), quote=True)

def pill(d):
    v = d["verify"]
    if re.search("SheerID", v, re.I): return "SheerID"
    if re.search("UNiDAYS", v, re.I): return "UNiDAYS"
    if "付费" in v: return "付费办理"
    if re.search(r"学校邮箱|\.edu", v): return "学校邮箱"
    if "邮箱注册" in v: return "邮箱注册"
    return "人工审核"

icons_js = open(os.path.join(ROOT, "icons.js"), encoding="utf-8").read()
ICONS = json.loads(subprocess.check_output(
    ["node", "-e", "global.window={};eval(require('fs').readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(window.ICONS))"],
    input=icons_js.encode()))

def icon(d):
    k = d.get("icon", "")
    if k.startswith("mono:"):
        _, t, bg = k.split(":")
        return f'<span class="bi mono{" long" if len(t) > 2 else ""}" style="background:{e(bg)}" aria-hidden="true">{e(t)}</span>'
    ic = ICONS.get(k)
    if not ic:
        return '<span class="bi mono" style="background:#141414" aria-hidden="true">★</span>'
    h = ic["hex"]
    fill = "#141414" if sum(int(h[i:i + 2], 16) for i in (1, 3, 5)) > 600 else h  # 白色图形放在白底上看不见
    return f'<span class="bi" aria-hidden="true"><svg viewBox="0 0 24 24" fill="{fill}"><path d="{ic["d"]}"/></svg></span>'

ARROW = ('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" '
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>')

# 与 index.html 里 ticket() 的结构保持一致；预渲染前 9 张（免费优先），脚本加载后接管
order = sorted(deals, key=lambda d: not d["free"])
cards = "".join(f'''
      <article class="ticket">
        <div class="t-main">
          <div class="t-head">{icon(d)}<div class="meta">{e(d["cat"])} · {e(d["region"])}</div></div>
          <h3>{e(d["name"])}</h3>
          <p class="offer">{e(d["offer"])}</p>
          <dl class="rows">
            <div><dt>资格</dt><dd>{e(d["who"])}</dd></div>
            <div><dt>验证</dt><dd>{e(d["verify"])}</dd></div>
          </dl>
          <div class="t-foot"><span class="pill">{e(pill(d))}</span><a class="cta" href="{e(d["url"])}" target="_blank" rel="noopener">去申请 {ARROW}</a></div>
        </div>
        <div class="stub{"" if d["free"] else " deal"}" aria-label="{"免费" if d["free"] else "折扣"}"><b>{"FREE" if d["free"] else "DEAL"}</b><span>{"免费" if d["free"] else "折扣"}</span></div>
      </article>''' for d in order[:9])

page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
page = re.sub(r"<title>.*?</title>\n?", "", page, count=1)
page = page.replace('<div class="grid" id="grid"></div>', f'<div class="grid" id="grid">{cards}\n    </div>')
for k, v in {"js-total": len(deals), "js-free": sum(1 for d in deals if d["free"]),
             "js-updated": updated, "js-month": (f"{int(updated.split('-')[1])} 月" if "-" in updated else updated)}.items():
    page = re.sub(rf'(class="{k}">)[^<]*(<)', rf"\g<1>{v}\2", page)

ld = {"@context": "https://schema.org", "@type": "ItemList", "name": "海外学生优惠清单",
      "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": d["name"], "url": d["url"]}
                          for i, d in enumerate(deals)]}
head = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(TITLE)}</title>
<meta name="description" content="{e(DESC)}">
<meta name="google-site-verification" content="e53tznfkhhCijPSgTLN8fvLbjxAnkYY7kBtX5b2WUY4">
<link rel="canonical" href="{SITE_URL}">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(TITLE)}">
<meta property="og:description" content="{e(DESC)}">
<meta property="og:url" content="{SITE_URL}">
<meta property="og:locale" content="zh_CN">
<meta name="twitter:card" content="summary">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>body{{margin:0}}[hidden]{{display:none!important}}</style>
'''
# 把 index.html 里的 <link>/<style> 留在 head，正文放进 body
split = page.index("</style>") + len("</style>")
out = head + page[:split] + "\n</head>\n<body>\n" + page[split:] + "\n</body>\n</html>\n"

shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(DIST)
open(os.path.join(DIST, "index.html"), "w", encoding="utf-8").write(out)
for name in ["deals.js", "icons.js", "v2.css"]:
    shutil.copy(os.path.join(ROOT, name), DIST)
shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(DIST, "assets"))
EXTRA_PAGES = ["budget.html", "black-friday.html", "bicester.html"]
for name in EXTRA_PAGES:
    src = open(os.path.join(ROOT, name), encoding="utf-8").read()
    open(os.path.join(DIST, name), "w", encoding="utf-8").write(src.replace("{{SITE_URL}}", SITE_URL))
open(os.path.join(DIST, ".nojekyll"), "w").close()
host = SITE_URL.split("/")[2]
if not host.endswith(".github.io"):  # GitHub Pages 自定义域名；DIST 每次重建，CNAME 要在这里写
    open(os.path.join(DIST, "CNAME"), "w").write(host + "\n")
open(os.path.join(DIST, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}sitemap.xml\n")
open(os.path.join(DIST, "sitemap.xml"), "w").write(
    f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f'  <url><loc>{SITE_URL}</loc><lastmod>{updated}-01</lastmod></url>\n'
    + "".join(f'  <url><loc>{SITE_URL}{n}</loc></url>\n' for n in EXTRA_PAGES) + '</urlset>\n')
print(f"built {len(deals)} deals -> {DIST} for {SITE_URL}")
