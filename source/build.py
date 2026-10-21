#!/usr/bin/env python3
"""把 index.html + deals.js + icons.js + v2.css 构建成可部署的静态站（dist/）。

做的事：补全 <head>（SEO 描述、canonical、Open Graph、JSON-LD），把全部优惠卡片
预先写进 HTML 让搜索引擎能读到，再生成 sitemap.xml、robots.txt。
用法：python3 build.py https://你的域名/ [输出目录，默认 ../docs]
"""
import html, json, os, re, shutil, subprocess, sys
from urllib.parse import quote

SITE_URL = (sys.argv[1] if len(sys.argv) > 1 else "https://sheeperks.com/").rstrip("/") + "/"
ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "..", "docs"))

TITLE = "学生优惠地图：海外在读学生可申请的软件、云服务与订阅优惠"
DESC = ("汇总 GitHub Student Pack、JetBrains、Azure for Students、Google AI 学生版、Notion、Figma、"
        "Spotify、Apple 教育优惠等海外学生优惠，写清资格、验证方式（学校邮箱、SheerID、UNiDAYS、ISIC）和官方申请入口。")

deals_js = open(os.path.join(ROOT, "deals.js"), encoding="utf-8").read()
data = json.loads(subprocess.check_output(
    ["node", "-e", "global.window={};eval(require('fs').readFileSync(0,'utf8'));"
     "process.stdout.write(JSON.stringify({deals:window.DEALS,updated:window.DEALS_UPDATED}))"],
    input=deals_js.encode()))
deals, updated = data["deals"], data["updated"]
e = lambda s: html.escape(str(s), quote=True)

# Cloudflare Web Analytics：不用 cookie（英国不用弹同意框），脚本 defer 加载，被墙也不拖慢页面。
# token 在 Cloudflare 后台 Analytics & Logs → Web Analytics → 添加 sheeperks.com 后拿到；留空则不注入。
CF_BEACON_TOKEN = ""
ANALYTICS = (f'<script defer src="https://static.cloudflareinsights.com/beacon.min.js" '
             f'data-cf-beacon=\'{{"token": "{CF_BEACON_TOKEN}"}}\'></script>\n') if CF_BEACON_TOKEN else ""

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

BRANDS = os.path.join(ROOT, "assets", "brands")

def logo(slug, alt=""):
    """品牌 logo 文件在 assets/brands/<slug>.svg|png；没有文件就不画。"""
    for ext in ("svg", "png", "webp"):
        if os.path.exists(os.path.join(BRANDS, f"{slug}.{ext}")):
            return f'<span class="bi img"><img src="assets/brands/{slug}.{ext}" alt="{e(alt)}" width="28" height="28" loading="lazy"></span>'
    return ""

def icon(d):
    k = d.get("icon", "")
    if k.startswith("img:"):
        return logo(k[4:].rsplit(".", 1)[0]) or f'<span class="bi mono" style="background:#141414" aria-hidden="true">{e(d["name"][0])}</span>'
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

# ---------- 本周羊毛 ----------
# weekly.js 里的时效条目在构建时写成票根卡片：首页「本周羊毛」放全部，穷鬼专区放 tag 为 food 的。
# 剩余天数、NEW 标、排序和过期下架由 lim.js 在浏览器里按英国当天日期算，这里只写默认文案。
wdata = json.loads(subprocess.check_output(
    ["node", "-e", "global.window={};eval(require('fs').readFileSync(0,'utf8'));"
     "process.stdout.write(JSON.stringify({w:window.WEEKLY,u:window.WEEKLY_UPDATED}))"],
    input=open(os.path.join(ROOT, "weekly.js"), encoding="utf-8").read().encode()))
WEEKLY, WEEKLY_UPDATED = wdata["w"], wdata["u"]
WD_CN, WD_EN = "一二三四五六日", ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
dot = lambda s: f"{s[5:7]}·{s[8:10]}"

def wticket(w):
    k = w["icon"]
    ic = icon({"icon": k, "name": w["meta"]}) if k.startswith("mono:") else (
        logo(k) or f'<span class="bi mono" style="background:#141414" aria-hidden="true">{e(w["meta"][0])}</span>')
    data = "".join(f' data-{a}="{e(w[a])}"' for a in ("added", "start", "end", "weekday") if w.get(a))
    if w.get("weekday"):
        n = int(w["weekday"])
        stub = f'<div class="stub week"><b>{WD_EN[n - 1]}</b><span>每周{WD_CN[n - 1]}</span></div>'
        pill = f"每周{WD_CN[n - 1]}"
    elif w.get("start"):
        endstub = f' data-endstub="{dot(w["end"])}"' if w.get("end") else ""
        stub = f'<div class="stub week"{endstub}><b>{dot(w["start"])}</b><span>开始</span></div>'
        pill = f'{w["start"][5:]} 开始'
    elif w.get("end"):
        stub = f'<div class="stub deal"><b>{dot(w["end"])}</b><span>截止</span></div>'
        pill = f'截至 {w["end"][5:]}'
    else:
        b, s, c = w["stub"]
        stub, pill = f'<div class="stub{" " + c if c else ""}"><b>{e(b)}</b><span>{e(s)}</span></div>', None
    pill = f'<span class="pill left">{e(pill)}</span>' if pill else '<span class="pill">长期 · 以官网为准</span>'
    ext = "" if w["url"].endswith(".html") else ' target="_blank" rel="noopener"'
    price = f' <em class="price">{e(w["price"])}</em>' if w.get("price") else ""
    rows = "".join(f"<div><dt>{e(dt)}</dt><dd>{dd}</dd></div>" for dt, dd in w["rows"])
    return f'''
      <article class="ticket lim-t" id="w-{e(w["id"])}"{data}>
        <div class="t-main">
          <div class="t-head">{ic}<div class="meta">{e(w["meta"])}</div></div>
          <h3>{e(w["title"])}{price}</h3>
          <p class="offer">{e(w["offer"])}</p>
          <dl class="rows">{rows}</dl>
          <div class="t-foot">{pill}<a class="cta" href="{e(w["url"])}"{ext}>{e(w["cta"])} {ARROW}</a></div>
        </div>
        {stub}
      </article>'''

WEEKLY_HOME = "".join(wticket(w) for w in WEEKLY)
WEEKLY_FOOD = "".join(wticket(w) for w in WEEKLY if w["tag"] == "food")

# ---------- 加群入口 ----------
# 每页页脚上方放进群二维码：把微信活码图片存成 assets/join-qr.png 就会出现，没有这张图则不显示。
# 用活码不用群二维码，因为微信群二维码 7 天就过期。
JOIN_QR = next((f"assets/join-qr.{x}" for x in ("png", "jpg", "webp")
                if os.path.exists(os.path.join(ROOT, "assets", f"join-qr.{x}"))), "")
JOIN = f'''<section class="join" id="join" aria-label="加入羊毛群">
  <div class="wrap"><div class="join-card">
    <div class="join-text">
      <div class="eyebrow">JOIN · 羊毛群</div>
      <h2>新羊毛，群里先发</h2>
      <p>网站上的限时优惠、快到期提醒、群友实测，每天在微信群推送，不用天天回来翻。</p>
      <ul><li>快到期的优惠提前提醒</li><li>群友实测哪些能用、哪些失效</li><li>发现失效在群里说一声，核实后网站下架</li></ul>
    </div>
    <figure class="join-qr"><img src="{JOIN_QR}" alt="微信扫码加入羊毛群" width="180" height="180" loading="lazy"><figcaption>微信扫码进群<small>在微信里打开可长按识别</small></figcaption></figure>
  </div></div>
</section>
''' if JOIN_QR else ""

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
page = page.replace("{{weekly}}", WEEKLY_HOME).replace("{{weekly_updated}}", WEEKLY_UPDATED[5:]).replace("{{weekly_count}}", str(len(WEEKLY)))
page = page.replace("<footer", JOIN + "<footer", 1)
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
{ANALYTICS}'''
# 把 index.html 里的 <link>/<style> 留在 head，正文放进 body
split = page.index("</style>") + len("</style>")
out = head + page[:split] + "\n</head>\n<body>\n" + page[split:] + "\n</body>\n</html>\n"

# ---------- 全站搜索 ----------
# 导航里的 {{search}} 换成搜索框；每页可搜的卡片补 id，文字写进 search-index.json，前端 search.js 首次打开时加载
SEARCH_BOX = ('<button class="sbox" type="button" data-search aria-haspopup="dialog" aria-label="搜索全站优惠">'
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">'
              '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>搜优惠、品牌、关键词</span><kbd>Ctrl K</kbd></button>')
PAGE_LABEL = {"index.html": "全部优惠", "budget.html": "穷鬼专区", "black-friday.html": "英国黑五",
              "bicester.html": "比斯特专区", "earn.html": "零花钱专区"}
ITEM_CLASS = {"ticket", "card", "row", "tl", "tip", "bc", "route", "cat"}
CHILD_OF = {"stack", "plan"}  # 这些容器的直接子元素算一张卡
TITLE_TAGS = {"h3", "h4", "summary", "th"}
from html.parser import HTMLParser

class Indexer(HTMLParser):
    VOID = {"img", "br", "hr", "input", "meta", "link", "source", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "use"}
    def __init__(self, src):
        super().__init__(convert_charrefs=True)
        self.src, self.stack, self.items, self.cur, self.sec, self.h2 = src, [], [], None, "", None
        self.lines = [0]
        for ln in src.split("\n"):
            self.lines.append(self.lines[-1] + len(ln) + 1)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = set((a.get("class") or "").split())
        parent = self.stack[-1] if self.stack else ("", set())
        skip = any(t in ("nav", "footer", "svg", "script", "style", "dialog") for t, _ in self.stack)
        if tag not in self.VOID:
            self.stack.append((tag, cls))
        if self.cur is not None:
            self.cur["text"].append(" ")
        if skip:
            return
        if tag == "h2":
            self.h2 = []
        if self.cur is None and (cls & ITEM_CLASS or tag == "details" or (tag == "div" and parent[1] & CHILD_OF)
                                 or (tag == "tr" and parent[0] == "tbody")):
            line, col = self.getpos()
            self.cur = {"depth": len(self.stack), "id": a.get("id"), "pos": self.lines[line - 1] + col + 1 + len(tag),
                        "title": [], "alt": [], "text": [], "tdepth": None, "sec": self.sec}
        elif self.cur is not None and self.cur["tdepth"] is None and not self.cur["title"] and (
                tag in TITLE_TAGS or cls & {"b", "d", "vs"}):
            self.cur["tdepth"] = len(self.stack)
        elif self.cur is not None and tag == "b" and not self.cur["alt"]:
            self.cur["bdepth"] = len(self.stack)
    def handle_endtag(self, tag):
        if not self.stack:
            return
        depth = len(self.stack)
        if self.cur is not None:
            self.cur["text"].append(" ")
            if self.cur.get("tdepth") == depth:
                self.cur["tdepth"] = -1
            if self.cur.get("bdepth") == depth:
                self.cur["bdepth"] = None
            if self.cur["depth"] == depth:
                self.items.append(self.cur)
                self.cur = None
        if tag == "h2" and self.h2 is not None:
            self.sec = re.sub(r"\s+", " ", "".join(self.h2)).strip()
            self.h2 = None
        while self.stack:
            t, _ = self.stack.pop()
            if t == tag:
                break
    def handle_data(self, d):
        if any(t in ("svg", "script", "style") for t, _ in self.stack):
            return
        if self.h2 is not None:
            self.h2.append(d)
        if self.cur is None:
            return
        self.cur["text"].append(d)
        if self.cur["tdepth"] is not None and self.cur["tdepth"] > 0:
            self.cur["title"].append(d)
        elif self.cur.get("bdepth"):
            self.cur["alt"].append(d)

def index_page(src, name):
    """给可搜元素补 id，返回（新 HTML, 索引条目）"""
    p = Indexer(src)
    p.feed(src)
    out, entries, n = src, [], 0
    norm = lambda parts: re.sub(r"\s+", " ", "".join(parts)).strip()
    for it in p.items:
        if not it["id"]:
            n += 1
            it["id"], it["new"] = f"s{n}", True
    for it in sorted(p.items, key=lambda x: -x["pos"]):
        if it.get("new"):
            out = out[:it["pos"]] + f' id="{it["id"]}"' + out[it["pos"]:]
    for it in p.items:
        title = norm(it["title"]) or norm(it["alt"]) or norm(it["text"])[:24]
        text = norm(it["text"])
        if text.startswith(title):
            text = text[len(title):].strip()
        entries.append([f"{name}#{it['id']}", PAGE_LABEL[name], title[:60], it["sec"], text[:700]])
    return out, entries

search_entries = [[f"./?q={quote(d['name'])}#deals", PAGE_LABEL["index.html"], d["name"], d["cat"],
                   " ".join(filter(None, [d["offer"], d.get("term", ""), d["who"], d["verify"], d["region"]]))] for d in deals]
search_entries += [[f"./#w-{w['id']}", PAGE_LABEL["index.html"], w["title"], "本周羊毛",
                    " ".join([w["meta"], w.get("price", ""), w["offer"]] + [re.sub("<[^>]+>", "", dd) for _, dd in w["rows"]])]
                   for w in WEEKLY if w["tag"] != "food"]
SEARCH_JS = '<script src="lim.js" defer></script>\n<script src="search.js" defer></script>\n'
out = out.replace("{{search}}", SEARCH_BOX).replace("</body>", SEARCH_JS + "</body>", 1)

shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(DIST)
open(os.path.join(DIST, "index.html"), "w", encoding="utf-8").write(out)
for name in ["deals.js", "icons.js", "v2.css", "search.js", "lim.js"]:
    shutil.copy(os.path.join(ROOT, name), DIST)
shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(DIST, "assets"))
EXTRA_PAGES = ["budget.html", "black-friday.html", "bicester.html", "earn.html"]
for name in EXTRA_PAGES:
    src = open(os.path.join(ROOT, name), encoding="utf-8").read()
    src = src.replace("{{weekly:food}}", WEEKLY_FOOD).replace("<footer", JOIN + "<footer", 1)
    src = re.sub(r"\{\{logo:([a-z0-9]+)\}\}", lambda m: logo(m.group(1)), src.replace("{{SITE_URL}}", SITE_URL))
    src = src.replace("</head>", ANALYTICS + "</head>", 1).replace("{{search}}", SEARCH_BOX).replace("</body>", SEARCH_JS + "</body>", 1)
    src, ents = index_page(src, name)
    search_entries += ents
    open(os.path.join(DIST, name), "w", encoding="utf-8").write(src)
json.dump({"p": list(PAGE_LABEL.values()), "i": search_entries}, open(os.path.join(DIST, "search-index.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
open(os.path.join(DIST, ".nojekyll"), "w").close()
host = SITE_URL.split("/")[2]
if not host.endswith(".github.io"):  # GitHub Pages 自定义域名；DIST 每次重建，CNAME 要在这里写
    open(os.path.join(DIST, "CNAME"), "w").write(host + "\n")
open(os.path.join(DIST, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}sitemap.xml\n")
open(os.path.join(DIST, "sitemap.xml"), "w").write(
    f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f'  <url><loc>{SITE_URL}</loc><lastmod>{updated}-01</lastmod></url>\n'
    + "".join(f'  <url><loc>{SITE_URL}{n}</loc></url>\n' for n in EXTRA_PAGES) + '</urlset>\n')
print(f"built {len(deals)} deals, {len(search_entries)} search entries -> {DIST} for {SITE_URL}")
