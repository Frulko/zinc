"""Resource sampler (ZN-046): runs a command and records wall and CPU time, peak RSS, RSS and CPU over time, and energy where the host allows.

measure(cmd, interval=0.05, energy=False) -> dict
  wall_s, user_s, sys_s   from the child's own accounting (wait4)
  peak_rss_mb             the child's high-water mark
  samples                 [{t, rss_mb, cpu_pct}] taken with `ps` every `interval` seconds (any POSIX host)
  energy_mj, energy_note  Linux with Intel RAPL (/sys/class/powercap) or macOS with `sudo -n powermetrics`; None and a note otherwise
"""
import os, platform, re, subprocess, time


def _ps(pid):
    r = subprocess.run(["ps", "-o", "rss=,%cpu=", "-p", str(pid)], capture_output=True, text=True)
    f = r.stdout.split()
    return (int(f[0]) / 1024.0, float(f[1])) if len(f) == 2 else None


def _rapl():
    p = "/sys/class/powercap/intel-rapl:0/energy_uj"
    try:
        return int(open(p).read())
    except OSError:
        return None


def measure(cmd, interval=0.05, energy=False, env=None, stdout=subprocess.DEVNULL):
    note, pm, e0 = None, None, None
    if energy:
        if platform.system() == "Linux" and _rapl() is not None:
            e0 = _rapl()
        elif platform.system() == "Darwin":
            try:
                pm = subprocess.Popen(["sudo", "-n", "powermetrics", "--samplers", "cpu_power", "-i", "100"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
                time.sleep(0.3)
                if pm.poll() is not None:
                    pm, note = None, "powermetrics needs `sudo -n` rights"
            except OSError:
                note = "powermetrics is not available"
        else:
            note = "no energy source on this host"
    t0 = time.perf_counter()
    p = subprocess.Popen(cmd, stdout=stdout, stderr=subprocess.DEVNULL, env=env)
    samples, status, ru = [], None, None
    while True:
        done, status, ru = os.wait4(p.pid, os.WNOHANG)
        if done:
            break
        s = _ps(p.pid)
        if s:
            samples.append({"t": round(time.perf_counter() - t0, 3), "rss_mb": round(s[0], 2), "cpu_pct": s[1]})
        time.sleep(interval)
    wall = time.perf_counter() - t0
    p.returncode = os.waitstatus_to_exitcode(status)
    mb = ru.ru_maxrss / (1024.0 * 1024.0) if platform.system() == "Darwin" else ru.ru_maxrss / 1024.0
    out = {"cmd": cmd, "exit": p.returncode, "wall_s": round(wall, 4), "user_s": round(ru.ru_utime, 4), "sys_s": round(ru.ru_stime, 4), "peak_rss_mb": round(mb, 2),
           "samples": samples, "energy_mj": None, "energy_note": note}
    if e0 is not None:
        e1 = _rapl()
        if e1 is not None and e1 >= e0:
            out["energy_mj"] = round((e1 - e0) / 1000.0, 1)
    if pm is not None:
        pm.terminate()
        try:
            text = pm.communicate(timeout=2)[0]
        except subprocess.TimeoutExpired:
            text = ""
        mw = [float(x) for x in re.findall(r"(?:CPU|Combined) Power[^:]*:\s*([\d.]+)\s*mW", text)]
        if mw:
            out["energy_mj"] = round(sum(mw) / len(mw) * wall, 1)
        else:
            out["energy_note"] = "powermetrics gave no power samples"
    return out
