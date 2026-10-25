"""A fake Notion API for tests/t1/markdown_reader.sh: the JSON shapes of https://developers.notion.com/reference (version 2026-03-11)
for one page whose children come in two pages of results (start_cursor), with nested blocks, a table and one 429 to retry.
Usage: python3 markdown_reader_notion.py <port> <log>"""
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

PAGE = "0123456789abcdef0123456789abcdef"
PID = "01234567-89ab-cdef-0123-456789abcdef"
TOKEN = "secret_test"


def rt(text, **ann):
    a = {"bold": False, "italic": False, "strikethrough": False, "underline": False, "code": False, "color": "default"}
    a.update({k: v for k, v in ann.items() if k != "href"})
    href = ann.get("href")
    return {"type": "text", "text": {"content": text, "link": {"url": href} if href else None}, "annotations": a, "plain_text": text, "href": href}


def block(id, type, body, children=False):
    return {"object": "block", "id": id, "type": type, "has_children": children, "in_trash": False, type: body}


CHILDREN = {
    PID: [
        block("b1", "heading_2", {"rich_text": [rt("Plan")], "is_toggleable": False, "color": "default"}),
        block("b2", "paragraph", {"rich_text": [rt("Read "), rt("this", bold=True), rt(" and "), rt("that", italic=True), rt(" on "),
                                                rt("the site", href="https://example.org"), rt(" with "), rt("x*2", code=True)], "color": "default"}),
        block("b3", "bulleted_list_item", {"rich_text": [rt("Outer point")], "color": "default"}, True),
        block("b4", "to_do", {"rich_text": [rt("Buy paper")], "checked": False, "color": "default"}),
        block("b5", "to_do", {"rich_text": [rt("Charge pen")], "checked": True, "color": "default"}),
        block("b6", "code", {"rich_text": [rt("print('hi')\nprint(2)")], "caption": [], "language": "python"}),
        block("b7", "divider", {}),
        block("b8", "table", {"table_width": 2, "has_column_header": True, "has_row_header": False}, True),
        block("b9", "quote", {"rich_text": [rt("Calm paper")], "color": "default"}),
        block("b10", "numbered_list_item", {"rich_text": [rt("First")], "color": "default"}),
        block("b11", "numbered_list_item", {"rich_text": [rt("Second")], "color": "default"}),
        block("b12", "unsupported", {}),
        block("b13", "heading_3", {"rich_text": [rt("After the cursor")], "is_toggleable": False, "color": "default"}),
    ],
    "b3": [block("b3a", "bulleted_list_item", {"rich_text": [rt("Inner point")], "color": "default"})],
    "b8": [block("r1", "table_row", {"cells": [[rt("Name")], [rt("Size")]]}),
           block("r2", "table_row", {"cells": [[rt("A4")], [rt("210 x 297")]]})],
}
seen = {"limited": False}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj, headers=()):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        with open(sys.argv[2], "a") as f:
            f.write("%s %s %s\n" % (u.path, self.headers.get("Notion-Version"), q.get("start_cursor", [""])[0]))
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self.send(401, {"object": "error", "status": 401, "code": "unauthorized", "message": "API token is invalid."})
        if self.headers.get("Notion-Version") != "2026-03-11":
            return self.send(400, {"object": "error", "status": 400, "code": "missing_version", "message": "Notion-Version header failed validation"})
        parts = u.path.strip("/").split("/")   # v1 pages <id> | v1 blocks <id> children
        if parts[:2] == ["v1", "pages"] and parts[2].replace("-", "") == PAGE:
            return self.send(200, {"object": "page", "id": PID, "in_trash": False, "properties": {
                "title": {"id": "title", "type": "title", "title": [rt("Reading list")]}}})
        if len(parts) == 4 and parts[:2] == ["v1", "blocks"] and parts[3] == "children":
            bid = PID if parts[2].replace("-", "") == PAGE else parts[2]
            if bid not in CHILDREN:
                return self.send(404, {"object": "error", "status": 404, "code": "object_not_found", "message": "Could not find block"})
            if bid == "b3" and not seen["limited"]:
                seen["limited"] = True
                return self.send(429, {"object": "error", "status": 429, "code": "rate_limited", "message": "slow down"}, [("Retry-After", "1")])
            items = CHILDREN[bid]
            start = int(q.get("start_cursor", ["0"])[0] or 0)
            size = 7 if bid == PID else 100   # the page's blocks come in two pages
            chunk = items[start:start + size]
            more = start + size < len(items)
            return self.send(200, {"object": "list", "type": "block", "block": {}, "results": chunk, "has_more": more,
                                   "next_cursor": str(start + size) if more else None})
        self.send(404, {"object": "error", "status": 404, "code": "object_not_found", "message": "no route " + u.path})


HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
