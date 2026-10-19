// Déclarations d'environnement pour l'autocomplétion VS Code (tsserver)
// Le compilateur Zinc Next fournit ces API nativement au runtime.

declare module 'zinc:icons' {
  import { Svg } from 'zinc:svg';
  export function icon(name: string, color?: i32, strokeWidth?: number): Svg | null;
}

interface FetchResponse {
  status: i32;
  text(): Promise<string>;
  bytes(): Promise<u8[]>;
}

interface FetchOptions {
  method?: string;
  headers?: string[][];
  body?: string;
  timeoutMs?: i32;
}

declare function fetch(url: string, options?: FetchOptions): Promise<FetchResponse>;
declare function encodeURIComponent(text: string): string;
declare const document: { hidden: boolean };
