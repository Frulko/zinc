// The fixture of native records (ZN-850): records, lists of records, nested and optional fields, a record parameter and a promise of records.
// Old and New are one record before and after a trailing field: the module writes one and the spec reads the other (append-only evolution).
import { NativeModule, requireNative } from 'zinc:native';

export interface Art { w: i32; h: i32; }
export interface Track {
  title: string;
  ms: number;
  plays: u32;
  fav: boolean;
  art: Art | null;
  tags: string[];
  cover: u8[];
  note?: string;
}
export interface Old { id: i32; }
export interface New { id: i32; label: string; }

interface Spec extends NativeModule {
  first(): Track;
  list(n: i32): Track[];
  later(n: i32): Promise<Track[]>;
  describe(t: Track): string;
  echo(ts: Track[]): Track[];
  newAsOld(): Old;
  oldAsNew(): New;
  readOld(x: New): i32;
  readNew(x: Old): string;
}
export default requireNative<Spec>('Tracks');
