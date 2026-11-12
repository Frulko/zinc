import os, pathlib, subprocess, tempfile, time
root = pathlib.Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / 'sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq'
    p.parent.mkdir(parents=True)
    def update(value):
        temporary = p.with_name(p.name + '.new')
        temporary.write_text(value)
        os.replace(temporary, p)
    update('600000')
    env = dict(os.environ, ZINC_ROOT=str(root),ZINC_BOARD_ROOT=d,ZINC_HEADLESS='1')
    for engine in [['--interp'], ['--engine','quickjs'], ['native']]:
        update('600000')
        command = [str(root/'.logs/power-events-native')] if engine == ['native'] else [str(root/'build/zinc'),'run',str(root/'tests/data/power/events.ts'),*engine]
        proc = subprocess.Popen(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
        try:
            time.sleep(1.2); update('700000')
            time.sleep(2); update('800000')
            out = proc.communicate(timeout=15)[0]
            print(engine, proc.returncode, out, flush=True)
            assert proc.returncode == 0 and 'events 1 0 1' in out
        finally:
            if proc.poll() is None: proc.kill(); proc.wait()
