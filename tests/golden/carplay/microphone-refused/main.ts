import { MicrophoneUplink } from '../../../../plugins/carplay/microphone';
import C from '../../../../plugins/carplay/native/carplay.spec';
import * as sys from 'zinc:sys';
function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
const errors: string[] = [];
const mic = new MicrophoneUplink((b: u8[]) => { throw new Error('must not transmit'); }, (e: string) => { errors.push(e); });
for (let i = 0; i < 6; i++) mic.start('lpcm', 16000, 1, 320, 0);
check(errors.length === 6, 'every rejected request reports an error');
check(sys.env('ZINC_PERMISSIONS') === 'enforce' ? errors[0].includes('needs the permission "microphone"') : errors[0] === 'No real microphone is available', 'permission denial or implicit fake fallback is refused');
const handles: i32[] = [];
for (let i = 0; i < 4; i++) {
  const h = C.micOpen(0, 16000, 1, 320, 0);
  check(h >= 0, 'rejected capture releases its encoder'); handles.push(h);
}
for (const h of handles) C.micClose(h);
mic.stop();
console.log('carplay microphone: permission/fake refusal cleanup ok');
