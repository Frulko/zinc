// The sample documents, parsed once at startup by zinc:svg (parse errors are reported on stderr).
import { Svg } from 'zinc:svg';
import { SAMPLES, NAMES } from './samples';

export interface Document {
  name: string;
  svg: Svg;
}

export const DOCUMENTS: Document[] = SAMPLES.map((source: string, i: i32): Document => ({ name: NAMES[i], svg: new Svg(source) }));

for (const d of DOCUMENTS) if (!d.svg.ok) console.error(`${d.name}: ${d.svg.error}`);

/** The compass, used by the zoom card. */
export const COMPASS_INDEX: i32 = 4;
