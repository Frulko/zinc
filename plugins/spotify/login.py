#!/usr/bin/env python3
"""Spotify PKCE login, once. Usage: plugins/spotify/login.py CLIENT_ID [OUT.json], default $ZINC_HOME/spotify.json (docs/plugins/spotify.md)"""
import base64, hashlib, json, os, secrets, sys, threading, webbrowser
import urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

SCOPES = ("user-read-playback-state user-modify-playback-state user-read-currently-playing "
          "playlist-read-private playlist-read-collaborative user-library-read "
          "user-library-modify user-read-recently-played user-read-playback-position")
REDIRECT = "http://127.0.0.1:8765/callback"

if len(sys.argv) not in (2, 3):
    sys.exit(__doc__)
client_id = sys.argv[1]
# no file named: the machine's shared login, $ZINC_HOME/spotify.json (~/.zinc), which every Zinc app of the machine and the installers use
out = sys.argv[2] if len(sys.argv) == 3 else os.path.join(os.environ.get("ZINC_HOME") or os.path.expanduser("~/.zinc"), "spotify.json")
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)

verifier = secrets.token_urlsafe(64)[:96]  # 43-128 chars of [A-Za-z0-9_-]
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
state = secrets.token_urlsafe(16)
got = {}

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/callback":
            self.send_response(404); self.end_headers(); return
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        got.update(q)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Done, you can close this tab." if "code" in q else b"Login failed.")
        threading.Thread(target=self.server.shutdown, daemon=True).start()
    def log_message(self, *a):
        pass

srv = HTTPServer(("127.0.0.1", 8765), H)
url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
    "client_id": client_id, "response_type": "code", "redirect_uri": REDIRECT,
    "scope": SCOPES, "state": state,
    "code_challenge_method": "S256", "code_challenge": challenge})
print("Opening:", url)
webbrowser.open(url)
srv.serve_forever()

if got.get("state") != state or "code" not in got:
    sys.exit("login failed: %r" % got)

body = urllib.parse.urlencode({
    "grant_type": "authorization_code", "code": got["code"], "redirect_uri": REDIRECT,
    "client_id": client_id, "code_verifier": verifier}).encode()
req = urllib.request.Request("https://accounts.spotify.com/api/token", data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
tok = json.load(urllib.request.urlopen(req))
data = {"client_id": client_id, "refresh_token": tok["refresh_token"]}
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(data, f)
print("Saved to", out, "(keep it private: it gives access to the account)")
print("Granted scopes:", tok.get("scope"))
print("Re-run in under 6 months (refresh tokens expire 6 months after this login).")
