// The machine's IP address(es), asked from the system: `hostname -I` on Linux (Raspberry Pi OS), `ipconfig getifaddr`
// on macOS. Empty string when there is no network yet (the badge then shows "no network").
import { run } from 'zinc:process';
import { platform } from 'zinc:sys';

export async function localIp(): Promise<string> {
  const mac = platform() === 'macos';
  const r = await run(mac ? 'ipconfig' : 'hostname', mac ? ['getifaddr', 'en0'] : ['-I'], {});
  if (r.code !== 0) return '';
  // hostname -I lists every address; the first IPv4 one is the useful one
  for (const part of r.stdout.trim().split(' ')) if (part.indexOf('.') > 0) return part;
  return '';
}
