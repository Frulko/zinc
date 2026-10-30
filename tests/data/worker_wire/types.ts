export interface Inner { name: string; score: number }
export interface All {
  n: number; i: i32; u: u32; b: boolean; s: string; bytes: u8[];
  nums: number[]; grid: i32[][]; names: string[];
  maybeN: number | null; maybeS: string | null; maybeI: Inner | null; maybeB: boolean | null;
  inner: Inner; inners: Inner[];
  opt?: number; optS?: string;
}
export interface Back { echo: All; seen: i32 }
