# Loaded by every python3 of the tests on a hosted CI runner (tests/run puts this directory on PYTHONPATH when ZINC_CI is set).
# There the reverse lookup of 127.0.0.1 (socket.getfqdn, which http.server calls when it binds) hangs for tens of seconds, so every small server a test starts
# looked dead (found with faulthandler: Timeout in socket.py getfqdn). The name of a local server does not matter: answer at once.
import socket

_getfqdn = socket.getfqdn
socket.getfqdn = lambda name='': (name if name and name not in ('0.0.0.0', '::') else 'localhost')
