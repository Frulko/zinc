#!/usr/bin/env python3
"""Fake systemd for the reMarkable display lease (integrations/remarkable-ink/lease.c, docs/reports/remarkable-bridge-design.md §8).

  sim.py systemctl ...      the shim (tests/native/rmpp/lease-sim/systemctl): show, is-active, start, stop, reset-failed
  sim.py systemd-run ...    the shim: one transient unit, its supervisor in the background (RuntimeMaxSec, WatchdogSec, ExecStopPost)
  sim.py run <lease>        the scripted sequence; exit 0 when every check holds

The model of xochitl.service is the stock one: StartLimitBurst=4 per 600 s over every start (manual ones too), Restart=on-failure,
OnFailure=rm-emergency (recorded as a reboot). Its process is /proc/1000 under LEASE_ROOT holding /dev/dri/card0, and it owns
/tmp/epframebuffer.lock. The clock is a file (LEASE_CLOCK) the sequence moves by hand."""
import fcntl, json, os, signal, struct, subprocess, sys, time

SIM = os.environ.get('LEASE_SIM', '')
ROOT = os.environ.get('LEASE_ROOT', '')
CLOCK = os.environ.get('LEASE_CLOCK', '')
XPID = 1000
CG = '/system.slice/zinc-lease.service'


def clock():
    with open(CLOCK) as f:
        return int(f.read().split()[0])


def set_clock(t):
    with open(CLOCK, 'w') as f:
        f.write(f'{t}\n')


class State:
    """The model's state, one JSON file, under an exclusive lock for the whole command."""
    def __enter__(self):
        self.lock = open(os.path.join(SIM, 'state.lock'), 'w')
        fcntl.flock(self.lock, fcntl.LOCK_EX)
        with open(os.path.join(SIM, 'state.json')) as f:
            self.s = json.load(f)
        return self.s

    def __exit__(self, *a):
        with open(os.path.join(SIM, 'state.json'), 'w') as f:
            json.dump(self.s, f, indent=1)
        self.lock.close()


def event(s, *e):
    s['events'].append([clock(), *e])


def xochitl_up(s):
    os.makedirs(f'{ROOT}/proc/{XPID}/fd', exist_ok=True)
    with open(f'{ROOT}/proc/{XPID}/comm', 'w') as f:
        f.write('xochitl\n')
    if not os.path.islink(f'{ROOT}/proc/{XPID}/fd/3'):
        os.symlink('/dev/dri/card0', f'{ROOT}/proc/{XPID}/fd/3')
    with open(f'{ROOT}/tmp/epframebuffer.lock', 'w') as f:
        f.write(f'{XPID}\nxochitl\nrmpp\n')


def xochitl_down(s, clean):
    subprocess.run(['rm', '-rf', f'{ROOT}/proc/{XPID}'])
    if clean:   # QLockFile removes its lock on a clean exit; a killed xochitl leaves it behind
        try: os.unlink(f'{ROOT}/tmp/epframebuffer.lock')
        except FileNotFoundError: pass


def start_xochitl(s, by):
    x = s['xochitl']
    if x['state'] == 'active':
        return 0
    t = clock()
    x['starts'] = [v for v in x['starts'] if t - v < 600]
    if len(x['starts']) >= 4:
        x['state'], x['result'] = 'failed', 'start-limit-hit'
        event(s, 'reboot', 'start-limit-hit, OnFailure=rm-emergency.service')
        return 1
    x['starts'].append(t)
    event(s, 'start', by)
    if s['faults'].get('start_fail', 0) > 0:
        s['faults']['start_fail'] -= 1
        x['state'], x['result'] = 'failed', 'exit-code'
        x['nrestarts'] += 1   # Restart=on-failure: systemd tries again by itself
        start_xochitl(s, 'auto')
        return 1
    x.update(state='active', result='success', enter=t)
    xochitl_up(s)
    return 0


def systemctl(args):
    verb, rest = args[0], args[1:]
    if verb in ('kill', 'freeze', 'thaw', 'mask', 'unmask', 'edit', 'set-property', 'daemon-reload', 'revert', 'disable'):
        with State() as s:
            event(s, 'forbidden', 'systemctl ' + ' '.join(args))
        return 0
    if verb == 'show':
        unit, props = rest[0].removesuffix('.service'), [rest[i + 1] for i, a in enumerate(rest) if a == '-p']
        with State() as s:
            if unit == 'xochitl':
                x = s['xochitl']
                v = {'StartLimitBurst': '4', 'StartLimitIntervalUSec': '10min', 'WatchdogUSec': '1min', 'OnFailure': 'rm-emergency.service',
                     'NRestarts': str(x['nrestarts']), 'Result': x['result'], 'ActiveState': x['state'],
                     'ActiveEnterTimestampMonotonic': str(x['enter'] * 1000000)}
            else:
                v = {'ControlGroup': CG if s['lease']['state'] != 'inactive' else '', 'ActiveState': s['lease']['state']}
        for p in props:
            print(v.get(p, '') if '--value' in rest else f'{p}={v.get(p, "")}')
        return 0
    unit = next((a for a in rest if not a.startswith('-')), '').removesuffix('.service')
    if verb == 'is-active':
        with State() as s:
            st = s['xochitl']['state'] if unit == 'xochitl' else s['lease']['state']
        if '--quiet' not in rest: print(st)
        return 0 if st == 'active' else 3
    if unit == 'xochitl':
        with State() as s:
            x = s['xochitl']
            event(s, verb, 'xochitl')
            if verb == 'start':
                return start_xochitl(s, 'lease')
            if verb == 'stop':
                if x['state'] == 'active':
                    timeout = s['faults'].pop('stop_timeout', False)   # xochitl took longer than its TimeoutStopSec: SIGKILL
                    x.update(state='inactive' if not timeout else 'failed', result='timeout' if timeout else 'success')
                    xochitl_down(s, clean=not timeout)
                return 0
            if verb == 'reset-failed':
                x['starts'] = []
                if x['state'] == 'failed': x.update(state='inactive', result='success')
                return 0
        return 1
    if unit == 'zinc-lease' and verb == 'stop':   # blocks until the unit is gone, as systemctl stop does
        with State() as s:
            pid = s['lease'].get('supervisor')
            if s['lease']['state'] == 'inactive': return 0
        os.kill(pid, signal.SIGTERM)
        return 0 if wait_inactive() else 1
    print(f'systemctl: {verb} {unit}: not modelled', file=sys.stderr)
    return 1


def wait_inactive(limit=20.0):
    end = time.time() + limit
    while time.time() < end:
        with State() as s:
            if s['lease']['state'] == 'inactive': return True
        time.sleep(0.05)
    return False


def systemd_run(args):
    opts, i = {'props': []}, 0
    while i < len(args) and args[i].startswith('-'):
        a = args[i]
        if a in ('-p', '--property', '-E', '--setenv'):
            opts['props' if a in ('-p', '--property') else 'env'] = opts.get('props' if a in ('-p', '--property') else 'env', []) + [args[i + 1]]
            i += 2; continue
        if a.startswith('--unit='): opts['unit'] = a[7:]
        if a.startswith('--working-directory='): opts['cwd'] = a[20:]
        i += 1
    opts['cmd'] = args[i:]
    with State() as s:
        if s['lease']['state'] != 'inactive':
            print(f'Failed to start transient service unit: Unit {opts["unit"]}.service was already loaded or has a fragment file.', file=sys.stderr)
            return 1
        s['lease'] = {'state': 'activating'}
    subprocess.Popen([sys.executable, __file__, 'supervise', json.dumps(opts)], start_new_session=True,
                     stdin=subprocess.DEVNULL, stdout=open(os.path.join(SIM, 'journal'), 'a'), stderr=subprocess.STDOUT)
    end = time.time() + 10
    while time.time() < end:
        with State() as s:
            if s['lease']['state'] != 'activating': break
        time.sleep(0.02)
    print('Running as unit: zinc-lease.service')
    return 0


def supervise(opts):
    props = dict(p.split('=', 1) for p in opts['props'])
    env = dict(os.environ, INVOCATION_ID='0123456789abcdef', NOTIFY_SOCKET=os.path.join(SIM, 'notify'))
    for e in opts.get('env', []): k, v = e.split('=', 1); env[k] = v
    stop = []
    signal.signal(signal.SIGTERM, lambda *a: stop.append('systemctl stop'))
    t0 = clock()
    main = subprocess.Popen(opts['cmd'], env=env, cwd=opts.get('cwd'), start_new_session=True)
    with State() as s:
        s['lease'] = {'state': 'active', 'supervisor': os.getpid(), 'main': main.pid, 'props': props}
        event(s, 'lease-start', ' '.join(opts['props']))
    rmax, wd = int(props.get('RuntimeMaxSec', '0')), int(props.get('WatchdogSec', '0'))
    while True:
        if main.poll() is not None: why = f'main process exited ({main.returncode})'; break
        if stop: why = stop[0]; break
        t = clock()
        if rmax and t - t0 >= rmax: why = 'RuntimeMaxSec'; break
        try: ping = int(open(env['NOTIFY_SOCKET']).read().split()[-1])
        except (OSError, ValueError, IndexError): ping = t0
        if wd and t - max(t0, ping) >= wd: why = 'watchdog timeout'; break
        time.sleep(0.03)
    with State() as s:
        s['lease']['state'] = 'deactivating'
    for sig, grace in ((signal.SIGTERM, 4.0), (signal.SIGKILL, 2.0)):   # KillMode=control-group: the session's process group
        try: os.killpg(main.pid, sig)
        except (ProcessLookupError, PermissionError): break
        end = time.time() + grace
        main.poll()
        while time.time() < end:
            try: os.killpg(main.pid, 0)
            except (ProcessLookupError, PermissionError): break
            main.poll(); time.sleep(0.03)
    main.poll()
    for p in os.listdir(f'{ROOT}/proc'):   # the kernel: dead processes leave /proc
        if p != str(XPID):
            try: os.kill(int(p), 0)
            except (ProcessLookupError, ValueError): subprocess.run(['rm', '-rf', f'{ROOT}/proc/{p}'])
    os.makedirs(f'{ROOT}/sys/fs/cgroup{CG}', exist_ok=True)
    open(f'{ROOT}/sys/fs/cgroup{CG}/cgroup.procs', 'w').close()
    post = props.get('ExecStopPost', '').split()
    r = subprocess.run(post, env=env, capture_output=True, text=True) if post else None
    with State() as s:
        event(s, 'lease-end', why, 'restore exit %s' % (r.returncode if r else '-'))
        s['lease'] = {'state': 'inactive'}
        s['stderr'].append((r.stderr if r else ''))


def fake_app():
    """The app under the lease: it checks it has the panel alone, then does what $LEASE_SIM/app-mode says."""
    mode = open(os.path.join(SIM, 'app-mode')).read().strip()
    me = os.getpid()
    os.makedirs(f'{ROOT}/proc/{me}/fd', exist_ok=True)
    open(f'{ROOT}/proc/{me}/comm', 'w').write('fake-app\n')
    os.symlink('/dev/dri/card0', f'{ROOT}/proc/{me}/fd/3')
    with State() as s:
        if s['xochitl']['state'] == 'active' or os.path.exists(f'{ROOT}/proc/{XPID}'): event(s, 'two engines', mode)
        if 'zinc-lease' not in open(f'{ROOT}/sys/power/wake_lock').read(): event(s, 'no wakelock', mode)
        if os.environ.get('ZINC_LEASE') != '1': event(s, 'no ZINC_LEASE', mode)   # what display-rmpp's ink session needs (native.h)
        event(s, 'app', mode)
    open(os.path.join(SIM, 'app.pid'), 'w').write(str(me))
    if mode == 'crash': os.kill(me, signal.SIGSEGV)
    if mode == 'quit':
        time.sleep(0.1); subprocess.run(['rm', '-rf', f'{ROOT}/proc/{me}']); sys.exit(0)
    while True: time.sleep(1)   # hang / run: until the lease or systemd ends it


def run(lease):
    """The scripted sequence: launches, app crashes and hangs, power-key presses, supervisor kills, the dead-man, failed starts."""
    for d in ('proc', 'tmp', 'sys/power', 'run'): os.makedirs(f'{ROOT}/{d}', exist_ok=True)
    for f in ('wake_lock', 'wake_unlock'): open(f'{ROOT}/sys/power/{f}', 'w').close()
    set_clock(0)
    with open(os.path.join(SIM, 'state.json'), 'w') as f:
        json.dump({'events': [], 'stderr': [], 'faults': {}, 'lease': {'state': 'inactive'},
                   'xochitl': {'state': 'inactive', 'result': 'success', 'nrestarts': 0, 'enter': 0, 'starts': []}}, f)
    with State() as s:
        start_xochitl(s, 'boot')
    app = os.path.join(SIM, 'fake-app')
    with open(app, 'w') as f: f.write(f'#!/bin/sh\nexec {sys.executable} {os.path.abspath(__file__)} app\n')
    os.chmod(app, 0o755)
    power = os.path.join(SIM, 'power'); os.mkfifo(power)
    pw = os.open(power, os.O_RDWR)   # a writer for the whole run: the lease's poll sees no hang-up
    fails, refusals, leases = [], 0, 0

    def check(what, ok):
        print(('ok   ' if ok else 'FAIL ') + what)
        if not ok: fails.append(what)

    def launch(t, mode='quit', extra=(), refused=None, during=None):
        nonlocal refusals, leases
        set_clock(t)
        open(os.path.join(SIM, 'app-mode'), 'w').write(mode)
        r = subprocess.run([lease, 'launch', *extra, app], capture_output=True, text=True)
        if refused:
            refusals += 1
            check(f't={t} refused: {refused}', r.returncode == 3 and 'refused:' in r.stderr and refused in r.stderr)
            if r.stderr.strip(): print('       ' + r.stderr.strip())
            return
        check(f't={t} {mode} launched', r.returncode == 0)
        if r.returncode: print(r.stderr); return
        leases += 1
        if during: during()
        check(f't={t} {mode}: the lease ended', wait_inactive())
        with State() as s:
            end = [e for e in s['events'] if e[1] == 'lease-end'][-1]
            restored = s['xochitl']['state'] == 'active'
        check(f't={t} {mode}: xochitl restored ({end[2]}, {end[3]})', restored and end[3] == 'restore exit 0')

    def until_app():
        end = time.time() + 10
        while time.time() < end and not os.path.exists(os.path.join(SIM, 'app.pid')): time.sleep(0.02)
        return int(open(os.path.join(SIM, 'app.pid')).read())

    def clear_app():
        try: os.unlink(os.path.join(SIM, 'app.pid'))
        except FileNotFoundError: pass

    def advance(dt):
        def go():
            until_app(); set_clock(clock() + dt)
        return go

    def press_power():
        until_app()
        now = time.time()
        for at, value in ((now, 1), (now + 2.5, 0)):   # a long press: down, up 2.5 s later (the events carry their own time)
            os.write(pw, struct.pack('@qi4xHHi', int(at), int(at % 1 * 1e6), 1, 116, value))

    def stop_unit():
        until_app()
        r = subprocess.run([lease, 'launch', app], capture_output=True, text=True)
        nonlocal refusals
        refusals += 1
        check('second launch refused while a lease runs', r.returncode == 3 and 'already running' in r.stderr)
        subprocess.run([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'systemctl'), 'stop', 'zinc-lease'])

    def kill_supervisor():
        until_app()
        with State() as s: main = s['lease']['main']
        os.kill(main, signal.SIGKILL)

    for step in (
        lambda: launch(10, refused='active for 10 s only'),
        lambda: launch(100, 'quit'),
        lambda: launch(130, refused='at least 60 s apart'),
        lambda: launch(400, 'crash'),
        lambda: launch(500, refused='2 times in the last 10 minutes'),
        lambda: launch(720, 'hang', ('--watchdog', '10'), during=advance(11)),
        lambda: launch(1100, 'run', during=press_power),
        lambda: launch(1450, 'run', during=stop_unit),
        lambda: launch(1800, 'run', during=kill_supervisor),
        lambda: launch(2150, refused='6 times in the last hour'),
        lambda: launch(3700, 'run', ('--max', '120'), during=advance(121)),
        lambda: (s_fault('stop_timeout', True), launch(4100, 'quit')),
        lambda: (s_fault('start_fail', 1), launch(4500, 'quit')),
        lambda: launch(4900, refused='restarted on its own'),
    ):
        clear_app(); step()

    with State() as s:
        ev, x = s['events'], s['xochitl']
    check('xochitl active at the end', x['state'] == 'active')
    check('no reboot (no start-limit-hit)', not [e for e in ev if e[1] == 'reboot'])
    check('never two engines, the wakelock always held under the app', not [e for e in ev if e[1] in ('two engines', 'no wakelock')])
    check('the app sees ZINC_LEASE=1', not [e for e in ev if e[1] == 'no ZINC_LEASE'])
    check('no forbidden systemctl verb (kill, freeze, mask, edit...)', not [e for e in ev if e[1] == 'forbidden'])
    ours = [e[0] for e in ev if e[1] == 'start' and e[2] == 'lease']
    worst = max((sum(1 for u in ours if t <= u < t + 600) for t in ours), default=0)
    check(f'at most 2 of our starts in any 600 s (worst {worst}; {len(ours)} starts for {leases} leases)', worst <= 2 and len(ours) == leases)
    resets = len([e for e in ev if e[1] == 'reset-failed'])
    check(f'reset-failed only after our clean stops ({resets} for {leases - 1} clean stops)', resets == leases - 1)
    check(f'every lease restored exactly once', len([e for e in ev if e[1] == 'lease-end' and e[3] == 'restore exit 0']) == leases)
    check('the wakelock released', not os.path.exists(f'{ROOT}/run/zinc-lease/wake') and 'zinc-lease' in open(f'{ROOT}/sys/power/wake_unlock').read())
    print(f'lease-sim: {leases} leases, {refusals} refusals, {len(fails)} failures')
    return 1 if fails else 0


def s_fault(k, v):
    with State() as s: s['faults'][k] = v


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'systemctl': sys.exit(systemctl(sys.argv[2:]))
    if cmd == 'systemd-run': sys.exit(systemd_run(sys.argv[2:]))
    if cmd == 'supervise': supervise(json.loads(sys.argv[2]))
    if cmd == 'app': fake_app()
    if cmd == 'run': sys.exit(run(os.path.abspath(sys.argv[2])))
