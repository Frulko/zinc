import json, pathlib, subprocess, sys, tempfile
with tempfile.TemporaryDirectory() as d:
    root = pathlib.Path(d)
    def probe(): return json.loads(subprocess.check_output([sys.argv[1], d]))
    def put(path, value):
        p = root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(value)
    p = probe()
    assert 'temperature unknown; CPU requested unknown MHz' in subprocess.check_output([sys.argv[1], d, 'summary'], text=True)
    assert p['temperatures'] == [] and p['underVoltage'] is None and p['fanRPM'] is None
    for name, value in {'thermal_zone7/type':'cpu-thermal', 'thermal_zone7/temp':'43210', 'thermal_zone2/type':'ambient', 'thermal_zone2/temp':'-1200', 'thermal_zone9/temp':'broken'}.items(): put('sys/class/thermal/' + name, value)
    for name, value in {'scaling_cur_freq':'600000', 'cpuinfo_max_freq':'1400000', 'scaling_max_freq':'1200000'}.items(): put('sys/devices/system/cpu/cpu0/cpufreq/' + name, value)
    put('sys/class/hwmon/hwmon8/name', 'rpi_volt')
    put('sys/class/hwmon/hwmon8/in0_lcrit_alarm', '1')
    put('sys/class/hwmon/hwmon1/name', 'pwmfan')
    put('sys/class/hwmon/hwmon1/fan1_input', '0')
    put('sys/class/hwmon/hwmon1/pwm1', '100')
    import struct
    words = ['10000000000000', '0'] if struct.calcsize('L') == 8 else ['100000', '0', '0', '0']
    put('sys/class/input/event3/device/capabilities/key', ' '.join(words))
    p = probe()
    assert p['powerButtonAvailable'] is True and p['powerButtonPressed'] is None
    assert [t['celsius'] for t in p['temperatures']] == [-1.2,43.21,None]
    assert (p['cpuRequestedMHz'],p['cpuMaxMHz'],p['cpuPolicyMaxMHz']) == (600,1400,1200)
    assert p['underVoltageAlarm'] is True and p['underVoltage'] is None
    assert p['fanRPM'] == 0 and p['fanDuty'] == 100
    summary = subprocess.check_output([sys.argv[1], d, 'summary'], text=True)
    assert 'thermal_zone7 (cpu-thermal) 43.210000 C' in summary and 'CPU requested 600.000000 MHz' in summary
    assert 'fan 0.000000 RPM' in summary and 'under-voltage unknown, recent alarm 1.000000' in summary
    for value, expected in [('0',False),('2',None),('NaN',None),('1 junk',None)]:
        put('sys/class/hwmon/hwmon8/in0_lcrit_alarm', value)
        assert probe()['underVoltageAlarm'] is expected
    put('sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq', '-1')
    assert probe()['cpuRequestedMHz'] is None
