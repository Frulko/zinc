export interface Job { id: i32; n: number; label: string; bytes: u8[]; fail: boolean }
export interface Done { id: i32; sum: number; label: string; size: i32; tags: string[]; note: string | null }
