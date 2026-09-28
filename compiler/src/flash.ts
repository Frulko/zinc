// zinc flash (esp32 firmware -> a board on this machine's USB port) and zinc monitor --port /dev/... (serial console).
// The firmware is built in Docker (ESP-IDF image), but Docker Desktop on macOS cannot pass USB serial devices to a
// container, so flashing uses a host esptool. docs/boards.md
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

/** esptool on the host: v5 installs `esptool`, v4 `esptool.py`; both also run as `python3 -m esptool`. */
function findEsptool(): { cmd: string[]; major: number } | null {
  for (const cmd of [['esptool'], ['esptool.py'], ['python3', '-m', 'esptool']]) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), 'version'], { encoding: 'utf8' });
    if (r.status !== 0) continue;
    const v = /(\d+)\.\d+/.exec((r.stdout ?? '').trim().split('\n').pop() ?? '');
    return { cmd, major: v ? Number(v[1]) : 4 };
  }
  return null;
}

/** USB serial ports that look like an ESP32 board (native USB-Serial/JTAG or a USB-UART bridge). */
export function serialPorts(): string[] {
  if (!fs.existsSync('/dev')) return [];
  return fs.readdirSync('/dev').filter(f => /^(cu\.usbmodem|cu\.usbserial|cu\.wchusbserial|cu\.SLAB_USBtoUART|ttyACM|ttyUSB)/.test(f)).sort().map(f => '/dev/' + f);
}

/** Writes build/merged-binary.bin (bootloader + partition table + app, made by `idf.py merge-bin`) at offset 0. */
export function flash(buildDir: string, chip: string, port: string | undefined): number {
  const image = path.join(buildDir, 'idf', 'build', 'merged-binary.bin');
  if (!fs.existsSync(image)) { console.error(`zinc: ${image} is missing (idf.py merge-bin failed?)`); return 1; }
  const tool = findEsptool();
  if (!tool) {
    console.error(`zinc: esptool is not installed on this machine.
  The firmware is built in Docker, but Docker Desktop on macOS cannot reach USB serial devices, so flashing runs on the
  host. Install it once:

    pip install esptool          (or: pipx install esptool / brew install esptool)

  then run the same zinc flash command again. Firmware to flash by hand: ${image} (offset 0x0).`);
    return 1;
  }
  const ports = serialPorts();
  const p = port ?? ports[0];
  if (!port && ports.length > 1) console.error(`zinc: several serial ports (${ports.join(', ')}), using ${p}; pick one with --port`);
  if (!p) console.error('zinc: no USB serial port found (/dev/cu.usbmodem*, /dev/ttyACM*): esptool will search; plug the board with a data USB-C cable');
  const args = [...tool.cmd.slice(1), '--chip', chip, ...(p ? ['--port', p] : []), '--baud', '460800',
    tool.major >= 5 ? 'write-flash' : 'write_flash', '0x0', image];
  console.error(`zinc: ${[tool.cmd[0], ...args].join(' ')}`);
  const r = spawnSync(tool.cmd[0], args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`zinc: flashing failed. If the board does not answer, put it in download mode: hold BOOT, press and release
  RESET, release BOOT, then run zinc flash again (press RESET afterwards to start the program).`);
    return r.status ?? 1;
  }
  console.error(`zinc: flashed. Serial console: zinc monitor --port ${p ?? '<port>'}`);
  return 0;
}

/** Raw serial console: the port's bytes go to stdout until Ctrl+C. USB-Serial/JTAG ignores the baud rate. */
export function serialMonitor(port: string, baud = 115200): void {
  if (!fs.existsSync(port)) {
    const ports = serialPorts();
    console.error(`zinc: ${port} does not exist${ports.length ? ` (found: ${ports.join(', ')})` : ' (no USB serial port found)'}`);
    process.exit(1);
  }
  const stty = spawnSync('stty', [process.platform === 'darwin' ? '-f' : '-F', port, String(baud), 'raw', '-echo'], { stdio: 'inherit' });
  if (stty.status !== 0) { console.error(`zinc: cannot configure ${port} (stty); python3 -m serial.tools.miniterm ${port} ${baud} is an alternative`); process.exit(1); }
  console.error(`zinc: ${port} at ${baud} baud, Ctrl+C to quit (press RESET on the board to see it boot)`);
  const s = fs.createReadStream(port);
  s.on('error', e => { console.error(`zinc: ${e.message}`); process.exit(1); });
  s.pipe(process.stdout);
}
