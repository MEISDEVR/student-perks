#!/usr/bin/env python3
"""把 index.html + deals.js 构建成可部署的静态站（dist/）。

做的事：补全 <head>（SEO 描述、canonical、Open Graph、JSON-LD），把全部优惠卡片
预先写进 HTML 让搜索引擎能读到，再生成 sitemap.xml、robots.txt。
用法：python3 build.py https://你的域名/ [输出目录，默认 ../docs]
"""
import html, json, os, re, shutil, subprocess, sys

SITE_URL = (sys.argv[1] if len(sys.argv) > 1 else "https://minchuan-dev.github.io/student-perks/").rstrip("/") + "/"
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

def initial(d):
    m = re.search(r"[A-Za-z0-9]", d["name"])
    return (m.group(0) if m else d["name"][0]).upper()

ARROW = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>')

cards = "".join(f'''
      <article class="deal">
        <div class="deal-head">
          <div class="logo" aria-hidden="true">{e(initial(d))}</div>
          <div class="deal-title"><h3>{e(d["name"])}</h3><div class="meta">{e(d["cat"])} · {e(d["region"])}</div></div>
          <span class="tag {"free" if d["free"] else "paid"}">{"免费" if d["free"] else "折扣"}</span>
        </div>
        <p class="offer">{e(d["offer"])}</p>
        <dl class="rows">
          <div><dt>资格</dt><dd>{e(d["who"])}</dd></div>
          <div><dt>验证</dt><dd>{e(d["verify"])}</dd></div>
        </dl>
        <div class="deal-foot"><span class="pill">{e(pill(d))}</span><a class="cta" href="{e(d["url"])}" target="_blank" rel="noopener">去官方申请 {ARROW}</a></div>
      </article>''' for d in deals)

featured = "".join(f'''
    <article class="feat">
      <div class="feat-top"><span>{e(d["cat"])}</span><span class="tag free">免费</span></div>
      <h3>{e(d["featured"])}</h3>
      <div class="name">{e(d["name"])}</div>
      <p>{e(d["offer"])}</p>
      <div class="feat-foot"><span>{e(d["region"])} · {e(pill(d))}</span><a href="{e(d["url"])}" target="_blank" rel="noopener">去申请 {ARROW}</a></div>
    </article>''' for d in deals if d.get("featured"))

page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
page = re.sub(r"<title>.*?</title>\n?", "", page, count=1)
page = page.replace('<div class="grid" id="grid"></div>', f'<div class="grid" id="grid">{cards}\n    </div>')
page = page.replace('<div class="featured" id="featured"></div>', f'<div class="featured" id="featured">{featured}\n    </div>')
for k, v in {"js-total": len(deals), "js-free": sum(1 for d in deals if d["free"]),
             "js-cats": len({d["cat"] for d in deals}), "js-updated": updated}.items():
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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2312302c'/%3E%3Ctext x='16' y='23' font-size='19' text-anchor='middle' fill='%23f3e24a' font-weight='900'%3E学%3C/text%3E%3C/svg%3E">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>body{{margin:0}}[hidden]{{display:none!important}}</style>
'''
# 把 index.html 里的 <link>/<style> 留在 head，正文放进 body
split = page.index("</style>") + len("</style>")
out = head + page[:split] + "\n</head>\n<body>\n" + page[split:] + "\n</body>\n</html>\n"

shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(DIST)
open(os.path.join(DIST, "index.html"), "w", encoding="utf-8").write(out)
shutil.copy(os.path.join(ROOT, "deals.js"), DIST)
open(os.path.join(DIST, ".nojekyll"), "w").close()
open(os.path.join(DIST, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}sitemap.xml\n")
open(os.path.join(DIST, "sitemap.xml"), "w").write(
    f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f'  <url><loc>{SITE_URL}</loc><lastmod>{updated}-01</lastmod></url>\n</urlset>\n')
print(f"built {len(deals)} deals -> {DIST} for {SITE_URL}")
