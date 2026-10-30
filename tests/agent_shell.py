# zinc agent under a live shell (D194): an app it starts gets ZINC_DISPLAY=shell, the socket and its name, and no file lease;
# an app whose zinc.json says "display": "gl" keeps the lease (no session answers here, so its start is refused).
import os, re, signal, socket, subprocess, sys, tempfile, threading, time
from pathlib import Path

zinc = str(Path(sys.argv[1]).resolve())

def until(check, why, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if check(): return
        time.sleep(.03)
    raise AssertionError(why)

with tempfile.TemporaryDirectory(prefix='zinc-shell-') as tmp:
    tmp = Path(tmp)
    device, work, run = tmp / 'device', tmp / 'work', tmp / 'run'
    run.mkdir()
    events = tmp / 'events'; events.touch()
    shell = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)   # a shell that answers a connect, as the player's zinc:shell does
    shell.bind(str(run / 'shell.sock')); shell.listen(8)
    def serve():
        while True:
            try: c, _ = shell.accept(); c.close()
            except OSError: return
    threading.Thread(target=serve, daemon=True).start()
    env = dict(os.environ, ZINC_HOME=str(device), ZINC_AGENT_SCREEN=str(run), ZINC_DISPLAY='fbdev')
    env.pop('ZINC_SHELL_SOCKET', None); env.pop('ZINC_DETERMINISTIC', None)
    log = (tmp / 'agent.log').open('w+')
    agent = subprocess.Popen([zinc, 'agent', '--bind', '127.0.0.1', '--port', '0', '--no-mdns', '--name', 'shell'], env=env, stdout=log, stderr=log)
    def dev(*args, ok=True):
        p = subprocess.run([zinc, 'device', *args], env=dict(env, ZINC_HOME=str(work)), capture_output=True, text=True, timeout=20)
        if ok: assert p.returncode == 0, p.stdout + p.stderr
        return p
    try:
        until(lambda: 'pairing code:' in (tmp / 'agent.log').read_text(), 'agent failed')
        text = (tmp / 'agent.log').read_text()
        dev('pair', '127.0.0.1:' + re.search(r'listening on 127.0.0.1:(\d+)', text)[1], re.search(r'pairing code: (\d+)', text)[1])
        for name, display in (('a', ''), ('g', 'gl')):
            app = tmp / name; app.mkdir()
            if display: (app / 'zinc.json').write_text('{"name":"%s","display":"%s"}' % (name, display))
            (app / 'run.sh').write_text('#!/bin/sh\necho "%s $ZINC_DISPLAY $ZINC_SHELL_SOCKET $ZINC_APP_NAME" >> "%s"\nexec sleep 60\n' % (name, events))
            dev('install', str(app), '--name', name)
        dev('run', 'a')
        until(lambda: events.read_text().startswith('a '), 'a did not start')
        line = events.read_text().splitlines()[0]
        assert line == 'a shell %s a' % (run / 'shell.sock'), line
        assert not (run / 'device-screen').exists(), 'an app under the shell took the file lease'
        dev('stop', 'a')
        p = dev('run', 'g', ok=False)
        assert p.returncode != 0 and 'did not yield' in p.stderr, 'a GL app skipped the lease: ' + p.stdout + p.stderr
        print('agent_shell: shell display without lease, GL app keeps the lease PASS')
    finally:
        for f in (device / 'agent/run').glob('*.pid'):
            try: os.killpg(int(f.read_text().splitlines()[0]), signal.SIGKILL)
            except (ProcessLookupError, ValueError): pass
        agent.terminate()
        try: agent.wait(timeout=5)
        except subprocess.TimeoutExpired: agent.kill(); agent.wait()
        shell.close()
