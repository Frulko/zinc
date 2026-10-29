"""check_site.py <site> [--anchors]: the site zinc doc wrote is static and whole. Every page loads only files of the site (no http(s) script,
stylesheet or image, nothing on localhost), every link to the site resolves to a file (and with --anchors to an id of that page), no MDX
component is left unrendered, and the search index is there. Prints one line per problem; exit 1 when there is one."""
import html.parser, os, re, sys, urllib.parse

site = sys.argv[1]
anchors = "--anchors" in sys.argv
problems = []

class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.refs = []; self.ids = set(); self.pre = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a: self.ids.add(a["id"])
        if tag == "pre": self.pre += 1
        for k in ("href", "src"):
            if a.get(k) is not None: self.refs.append((tag, k, a[k]))
    def handle_endtag(self, tag):
        if tag == "pre": self.pre -= 1

pages = {}
for d, _, files in os.walk(site):
    for f in files:
        if f.endswith(".html"):
            p = os.path.join(d, f)
            text = open(p, encoding="utf-8").read()
            pg = Page(); pg.feed(text)
            pages[os.path.normpath(p)] = (pg, text)
if not pages: problems.append("no page")
for p, (pg, text) in pages.items():
    rel = os.path.relpath(p, site)
    # an MDX component left as a tag outside code: <Steps>, </Callout>... (the code blocks escape theirs as &lt;)
    for m in re.finditer(r"<(/?)(Steps|Step|Tabs|Tab|Callout|Cards|Card|Command|Screenshot|Example|Details|ApiRef)[\s>/]", text):
        problems.append(f"{rel}: MDX component left as is: {m.group(0)}")
    for tag, k, url in pg.refs:
        u = urllib.parse.urlsplit(url)
        if u.scheme in ("http", "https"):
            if tag != "a": problems.append(f"{rel}: <{tag} {k}> loads from the network: {url}")
            if u.hostname in ("localhost", "127.0.0.1", "0.0.0.0"): problems.append(f"{rel}: link to {url}")
            continue
        if u.scheme in ("mailto", "tel", "data"): continue
        if u.scheme: problems.append(f"{rel}: unexpected URL {url}"); continue
        target = os.path.normpath(os.path.join(os.path.dirname(p), urllib.parse.unquote(u.path))) if u.path else p
        if not os.path.isfile(target): problems.append(f"{rel}: {url} leads nowhere"); continue
        if anchors and u.fragment and target.endswith(".html"):
            ids = pages[target][0].ids if target in pages else set()
            if urllib.parse.unquote(u.fragment) not in ids: problems.append(f"{rel}: {url}: no such anchor")
idx = os.path.join(site, "_zdoc", "search-index.js")
if not os.path.isfile(idx) or not open(idx, encoding="utf-8").read().startswith("window.ZDOC_INDEX=["): problems.append("no search index")
for f in ("style.css", "doc.js"):
    if not os.path.isfile(os.path.join(site, "_zdoc", f)): problems.append(f"no _zdoc/{f}")
for f in ("style.css", "doc.js"):   # the theme's own files fetch nothing (the pages' text may well mention localhost)
    p = os.path.join(site, "_zdoc", f)
    if os.path.isfile(p) and re.search(r"(localhost|127\.0\.0\.1|https?://)", open(p, encoding="utf-8").read()): problems.append(f"_zdoc/{f} names a host")
for x in problems[:30]: print(x)
if len(problems) > 30: print(f"... {len(problems) - 30} more")
print(f"{len(pages)} pages, {len(problems)} problems")
sys.exit(1 if problems else 0)
