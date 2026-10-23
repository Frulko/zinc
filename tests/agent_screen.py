import json, os, re, signal, subprocess, sys, tempfile, time
from pathlib import Path

zinc = str(Path(sys.argv[1]).resolve())
root = Path.cwd()
processes = []

def until(check, why, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if check(): return
        time.sleep(.03)
    raise AssertionError(why)

def alive(pid):
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False

with tempfile.TemporaryDirectory(prefix='zinc-screen-') as tmp:
    tmp = Path(tmp)
    device, work, run, tools = (tmp / n for n in ('device', 'work', 'run', 'bin'))
    run.mkdir(); tools.mkdir()
    events = tmp / 'events'
    events.touch()
    # The player/boot app records its life; no window, framebuffer, network or real app is used.
    fake = tools / 'zinc'
    fake.write_text('''#!/usr/bin/env python3
import os, signal, sys, time
from pathlib import Path
if sys.argv[1] == '--version': print('zinc-next test'); sys.exit(0)
f = Path(os.environ['SCREEN_EVENTS'])
role = 'player' if sys.argv[2].endswith('player.zapp') else 'boot'
def event(s):
    with f.open('a') as out: out.write(s + '\\n')
def stop(sig, frame):
    time.sleep(.15)
    event('stop:' + role)
    sys.exit(0)
signal.signal(signal.SIGTERM, stop)
event('start:' + role)
while True: time.sleep(.05)
''')
    fake.chmod(0o755)
    # macOS has no setsid executable; reproduce Linux's process-session launch for this fixture.
    setsid = tools / 'setsid'
    setsid.write_text('#!/usr/bin/env python3\nimport os,sys\nos.setsid()\nos.execvp(sys.argv[1], sys.argv[1:])\n')
    setsid.chmod(0o755)
    notify = tools / 'systemd-notify'; notify.write_text('#!/bin/sh\nexit 0\n'); notify.chmod(0o755)
    env = dict(os.environ, ZINC_HOME=str(device), ZINC_AGENT_SCREEN=str(run),
               ZINC_RUN=str(run), ZINC_APP=str(tmp / 'boot'), ZINC_PLAYER='player.zapp',
               SCREEN_EVENTS=str(events), PATH=str(tools) + os.pathsep + os.environ['PATH'])
    env.pop('ZINC_DETERMINISTIC', None)
    (tmp / 'boot').touch()
    log = (tmp / 'agent.log').open('w+')
    sessionlog = (tmp / 'session.log').open('w+')
    agent = subprocess.Popen([zinc, 'agent', '--bind', '127.0.0.1', '--port', '0', '--no-mdns', '--name', 'screen'], env=env, stdout=log, stderr=log)
    processes.append(agent)
    session = subprocess.Popen(['bash', str(root / 'image/files/usr/lib/zinc/zinc-session')], env=env, stdout=sessionlog, stderr=sessionlog)
    processes.append(session)
    def dev(*args, ok=True):
        p = subprocess.run([zinc, 'device', *args], env=dict(env, ZINC_HOME=str(work)), capture_output=True, text=True, timeout=20)
        if ok: assert p.returncode == 0, p.stdout + p.stderr
        return p
    try:
        until(lambda: 'pairing code:' in (tmp / 'agent.log').read_text(), 'agent failed')
        text = (tmp / 'agent.log').read_text()
        port = re.search(r'listening on 127.0.0.1:(\d+)', text)[1]
        code = re.search(r'pairing code: (\d+)', text)[1]
        dev('pair', '127.0.0.1:' + port, code)
        until(lambda: 'start:boot' in events.read_text(), 'boot app failed')
        for name in ('a', 'b', 'c'):
            app = tmp / name; app.mkdir()
            (app / 'run.sh').write_text('#!/bin/sh\necho start:' + name + ' >> "' + str(events) + '"\nexec sleep 60\n')
            dev('install', str(app), '--name', name)
        dev('run', 'a')
        until(lambda: 'start:a' in events.read_text(), 'a did not start')
        lines = events.read_text().splitlines()
        assert lines.index('stop:boot') < lines.index('start:a'), lines
        a = int((device / 'agent/run/a.pid').read_text().splitlines()[0])
        dev('run', 'b')
        until(lambda: not alive(a), 'the first app survived replacement')
        assert 'start:player' not in events.read_text(), 'player resumed over a running app'
        dev('stop', 'b')
        until(lambda: 'start:player' in events.read_text(), 'player did not resume')
        # Concurrent launch requests still leave just one app.
        callers = [subprocess.Popen([zinc, 'device', 'run', n], env=dict(env, ZINC_HOME=str(work)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for n in ('a', 'c')]
        for p in callers: assert p.wait(timeout=15) == 0
        until(lambda: dev('apps').stdout.count('running, pid') == 1, 'concurrent apps own the screen')
        for name in ('a', 'c'): dev('stop', name)
        # A live dev program shares the same lease, and cannot outlive its replacement.
        live = tmp / 'live'; (live / 'src').mkdir(parents=True)
        (live / 'zinc.json').write_text('{"name":"live","entry":"src/main.ts"}')
        (live / 'src/main.ts').write_text("console.log('live-screen'); setInterval(() => {}, 1000);")
        livelog = (tmp / 'live.log').open('w+')
        watcher = subprocess.Popen([zinc, 'dev', str(live), '--device', 'screen'], env=dict(env, ZINC_HOME=str(work)), stdout=livelog, stderr=livelog)
        processes.append(watcher)
        until(lambda: 'live-screen' in (tmp / 'live.log').read_text(), 'live dev did not acquire screen')
        livepid = int((run / 'device-screen').read_text())
        dev('run', 'a')
        until(lambda: not alive(livepid) and watcher.poll() is not None, 'replaced dev session survived')
        dev('stop', 'a')
        follower = subprocess.Popen([zinc, 'device', 'run', 'b', '-f'], env=dict(env, ZINC_HOME=str(work)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        processes.append(follower)
        until(lambda: (device / 'agent/run/b.pid').exists(), 'first follower did not start')
        time.sleep(.2)
        dev('run', 'b')
        assert follower.wait(timeout=10) == 0, 'old follower did not end on replacement'
        assert 'running, pid' in dev('apps').stdout, 'old follower stopped its replacement'
        dev('stop', 'b')
        # Ctrl-C of a followed run stops its app; standalone logs -f remains a detach operation.
        caller = subprocess.Popen([zinc, 'device', 'run', 'b', '-f'], env=dict(env, ZINC_HOME=str(work)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        processes.append(caller)
        until(lambda: 'b ' in dev('apps').stdout and (device / 'agent/run/b.pid').exists(), 'followed app failed')
        time.sleep(.2)
        caller.send_signal(signal.SIGINT)
        assert caller.wait(timeout=10) == 130
        until(lambda: not (device / 'agent/run/b.pid').exists(), 'Ctrl-C left app running')
        # Missing acknowledgement cancels before the script's first instruction.
        session.terminate(); session.wait(timeout=5)
        count = events.read_text().count('start:a')
        p = dev('run', 'a', ok=False)
        assert p.returncode != 0 and 'did not yield' in p.stderr, p.stderr
        assert events.read_text().count('start:a') == count
        assert not (run / 'device-screen').exists(), 'failed start left a display lease'
        print('agent_screen: replacement, ordered handoff, return, concurrency, Ctrl-C and missing acknowledgement PASS')
    finally:
        for f in (device / 'agent/run').glob('*.pid'):
            try: os.killpg(int(f.read_text().splitlines()[0]), signal.SIGKILL)
            except ProcessLookupError: pass
        for p in reversed(processes):
            if p.poll() is None: p.terminate()
        for p in processes:
            try: p.wait(timeout=5)
            except subprocess.TimeoutExpired: p.kill(); p.wait()
