// What a visitor hears of the audio descriptions (ZN-650.10): for every picture, object and panorama of a museum-table project, in every
// language, the description is there, its clip decodes, lasts what its subtitles say and gives sound when it is played. One line per clip.
//   ZINC_HEADLESS=1 zinc run tests/data/museum_access/heard.ts -- <assets directory>
// Not in a deterministic run, which decodes no sound: the mix of the silent output is read instead (zinc:audio's `mix`).
import { args, exit } from 'zinc:sys';
import { readText, readBytes, exists } from 'zinc:fs';
import { decode, mix, SAMPLE_RATE } from 'zinc:audio';
import { parseProject, spokenDescription } from '../../../examples/museum-table/src/project';
import { parseVtt } from '../../../examples/museum-table/src/narration';

const dir = args()[0], project = parseProject(readText(`${dir}/project.json`));
let said = 0, bad = 0;
for (const m of project.media) {
  if (m.kind !== 'photo' && m.kind !== 'model' && m.kind !== 'panorama') continue;
  const spoken = spokenDescription(project, m);
  for (const lang of project.languages) {
    const name = `${m.id} ${lang}`;
    if (spoken === null || (m.audioDescription.get(lang) ?? '').length === 0) { console.log(`${name}: no audio description`); bad++; continue; }
    const clip = `${dir}/${spoken.file.replaceAll('{lang}', lang)}`, vtt = `${dir}/${spoken.subtitles.replaceAll('{lang}', lang)}`;
    if (spoken.file.length === 0 || !exists(clip) || !exists(vtt)) { console.log(`${name}: no clip or no subtitles`); bad++; continue; }
    const cues = parseVtt(readText(vtt)), written = cues.length > 0 ? cues[cues.length - 1].to : 0, sound = decode(readBytes(clip), clip);
    // the first second of the clip, as the mixer gives it: a voice, not silence
    sound.play();
    let peak = 0;
    for (const v of mix(SAMPLE_RATE)) peak = Math.max(peak, Math.abs(v));
    sound.stop();
    const ok = sound.ok && Math.abs(sound.duration - written) < 0.3 && peak > 0.05 && cues.length > 0;
    console.log(`${name}: ${sound.duration.toFixed(1)} s of sound, subtitles to ${written.toFixed(1)} s in ${cues.length} cues, peak ${peak > 0.05 ? 'heard' : 'silent'}${ok ? '' : ' WRONG'}`);
    sound.unload();
    if (ok) said++; else bad++;
  }
}
console.log(bad === 0 ? `${said} audio descriptions, all heard` : `${bad} audio descriptions missing or wrong`);
if (bad > 0) exit(1);
