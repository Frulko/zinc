import type { Scene } from 'zinc:system/window';

export interface Cmd { kind: string; n: i32; ms: number }
export interface Reply { n: i32; text: string; scene: Scene }
