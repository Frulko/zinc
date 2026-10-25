// The sounds of a table, checked without a loudspeaker: every sound the table names is played once through the game's
// own audio (src/audio.ts) on the mixer that has no output, and the first half second of what the mixer renders is
// measured. For whoever makes a table: a file that is missing or does not decode, and a sound that is silent, are named.
//   ZINC_HEADLESS=1 zinc run examples/pinball3d/tools/soundcheck.ts -- <table>
// One line per sound: its name, its file (or the tone it is), its length and its peak (1 is full scale); then the
// size of the files. It ends with 1 when a sound is silent. (In a deterministic run zinc:audio is a stand-in that
// decodes nothing, and every sound is silent: add ZINC_NATIVE=real there.)
import { args, exit } from 'zinc:sys';
import { mix, stopAll, backend } from 'zinc:audio';
import { loadTable, filesOf } from '../../pinball-kit/format/table';
import { openTable } from '../../pinball-kit/format/source';
import { TableAudio } from '../src/audio';

function main(): i32 {
  const a = args();
  if (a.length < 1) { console.log('usage: soundcheck.ts -- <table>'); return 2; }
  if (backend() !== 'null') { console.log(`soundcheck: the audio output is ${backend()}; run it with ZINC_HEADLESS=1, where the mixer can be read`); return 2; }
  const table = loadTable(openTable(a[0])), t = table.def;
  const audio = new TableAudio(table);
  let silent = 0;
  for (const d of t.sounds) {
    audio.preview(d.id);
    let peak = 0;
    for (const v of mix(24000)) if (Math.abs(v) > peak) peak = Math.abs(v);
    stopAll();
    mix(480);   // what was playing has left the mixer before the next one starts
    if (peak < 0.001) silent++;
    const what = d.file !== '' ? d.file : `a ${d.wave} tone of ${d.hz} Hz`;
    console.log(`${d.id}: ${what}, ${audio.seconds(d.id).toFixed(3)} s, peak ${peak.toFixed(3)}${d.loop ? ', loops' : ''}${peak < 0.001 ? ': SILENT' : ''}`);
  }
  let bytes = 0, files = 0;
  const src = table.source;
  if (src !== null) {
    const sounds: string[] = [];
    for (const d of t.sounds) if (d.file !== '' && sounds.indexOf(d.file) < 0) sounds.push(d.file);
    for (const f of filesOf(t)) if (sounds.indexOf(f) >= 0 && src.has(f)) { bytes += src.bytes(f).length; files++; }
  }
  console.log(`${t.sounds.length} sounds, ${silent} silent; ${files} files, ${bytes} bytes`);
  return silent > 0 ? 1 : 0;
}
exit(main());
