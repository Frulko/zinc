import { lucide } from 'zinc:icons/lucide';
export function defaultSvg(name: string = 'rocket'): string { return lucide(name); }
export function unusedSvg(): string { return lucide('apple'); }
