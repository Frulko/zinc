import json, pathlib, subprocess, sys, tempfile
probe = sys.argv[1]
with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp)
    def put(name, data):
        p = root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data if isinstance(data, bytes) else data.encode())
    def run(): return json.loads(subprocess.check_output([probe, str(root)]))
    r = run()
    assert r['BOARD'] == '' and not any(r['caps'].values()), r
    # Big endian cells, NUL strings, revision fallback and every generation.
    for code, model, soc, ram in [(0x2,'Model B','BCM2835',256),(0xa01041,'2 Model B','BCM2836',1024),
        (0xa020d3,'3 Model B Plus','BCM2837',1024),(0xc03111,'4 Model B','BCM2711',4096),
        (0xd04170,'5','BCM2712',8192),(0xd04190,'500','BCM2712',8192),(0xe04180,'Compute Module 5','BCM2712',16384)]:
        put('proc/device-tree/system/linux,revision',code.to_bytes(4,'big'))
        r = run()
        assert (r['BOARD'],r['SOC'],r['RAM_MB']) == ('Raspberry Pi '+model,soc,ram), r
        assert not any(r['caps'].values()), r
    put('proc/device-tree/model','Fixture Pi\0')
    put('proc/device-tree/compatible',b'raspberrypi,5-model-b\0brcm,bcm2712\0')
    put('proc/device-tree/hat/product','Panel\0')
    put('proc/device-tree/hat/vendor','Maker\0')
    put('sys/bus/gpio/devices/gpiochip512/label','pinctrl-rp1\n')
    put('sys/class/gpio/gpiochip0/label','pinctrl-bcm2835\n')
    for p in ['dev/i2c-1','dev/spidev0.0','dev/video10','sys/class/pwm/pwmchip0/npwm',
              'proc/asound/card0/id','sys/class/bluetooth/hci0/address','sys/class/net/wlan0/operstate']:
        put(p,'')
    r = run()
    assert r['BOARD']=='Fixture Pi' and r['hatProduct']=='Panel' and r['hatVendor']=='Maker', r
    assert r['compatible']=='raspberrypi,5-model-b,brcm,bcm2712',r
    assert set(r['gpioLabels'])=={'pinctrl-rp1','pinctrl-bcm2835'},r
    assert all(r['caps'][k] for k in ['gpio','i2c','spi','pwm','audio','ble','wifi']),r
    assert not r['caps']['hwdec-h264'] and not r['caps']['camera'], 'video filename is not decoder evidence'
    (root/'proc/device-tree/system/linux,revision').unlink()
    put('proc/cpuinfo','Revision\t: 100000f\n')
    assert run()['RAM_MB']==512
    put('proc/cpuinfo','Revision\t: 0015\n')
    put('proc/meminfo','MemTotal: 491520 kB\n')
    assert run()['RAM_MB']==480
print('board fixtures: pass')
