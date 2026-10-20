# The relay's messages for examples/music (ZN-758): made-up notifications, one line each, "<seconds> <message JSON>" (ZINC_MUSIC_RELAY of the
# app, and relay.ts, the stand-in for Zinc Relay). Protocol: docs/reports/notification-relay-design.md.
#   feed.py <data dir> [--now] [--one] [--at S]
# --now: dates counted from now (else from 0, a deterministic run's clock); --one: the first notification only; --at: when it arrives (3 s).
import base64, hashlib, json, sys, time
d = sys.argv[1]
now = int(time.time()) if '--now' in sys.argv else 0
at = float(sys.argv[sys.argv.index('--at') + 1]) if '--at' in sys.argv else 3.0
def image(name):
    raw = open(f'{d}/{name}', 'rb').read()
    return hashlib.sha256(raw).hexdigest(), base64.b64encode(raw).decode()
mail_h, mail_png = image('notif-icon.png')
msgs_h, msgs_png = image('notif-messages.png')
claire_h, claire_png = image('notif-avatar.png')
mail = {'id': 'com.apple.mail', 'name': 'Mail', 'icon': mail_h}
messages = {'id': 'com.apple.MobileSMS', 'name': 'Messages', 'icon': msgs_h}
chrome = {'id': 'com.google.Chrome', 'name': 'Google Chrome', 'icon': ''}
out = [
  (0.5, {'t': 'hello', 'app': 'notify-relay', 'v': 1, 'host': 'MacBook de test'}),
  (0.8, {'t': 'icon', 'hash': mail_h, 'png': mail_png}),
  (0.8, {'t': 'icon', 'hash': msgs_h, 'png': msgs_png}),
  (0.8, {'t': 'icon', 'hash': claire_h, 'png': claire_png}),
  (at, {'t': 'notif', 'id': 'n1', 'kind': 'message', 'sender': 'Claire Martin', 'avatar': claire_h, 'app': messages, 'title': 'Claire Martin', 'subtitle': '',
        'body': 'On se retrouve à 20 h chez Paul ? Je prends le dessert, tu peux apporter le pain.', 'date': now - 120, 'domain': None, 'thread': 'claire'}),
  (at + 0.5, {'t': 'notif', 'id': 'n2', 'kind': 'other', 'app': mail, 'title': 'La Poste', 'subtitle': 'Colis', 'body': 'Votre colis arrive demain entre 9 h et 13 h.',
        'avatar': None, 'date': now - 60, 'domain': None, 'thread': 'poste'}),
  (at + 0.6, {'t': 'notif', 'id': 'n3', 'kind': 'other', 'app': chrome, 'title': 'Nouvelle pull request', 'subtitle': '', 'body': 'zinc#812 : music, notifications du Mac',
        'avatar': None, 'date': now - 30, 'domain': 'github.com', 'thread': ''}),
  (at + 0.7, {'t': 'notif', 'id': 'n4', 'kind': 'message', 'sender': 'Julie', 'avatar': None, 'app': messages, 'title': 'Julie', 'subtitle': '',
        'body': 'Tu passes prendre le pain en rentrant ?', 'date': now, 'domain': None, 'thread': 'julie'}),
]
if '--one' in sys.argv: out = out[:5]
for t, m in out: print(t, json.dumps(m, ensure_ascii=False))
