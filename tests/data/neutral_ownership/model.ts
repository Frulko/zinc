export { componentSignal as state } from 'zinc:ui/kit/host';
import { componentEffect } from 'zinc:ui/kit/host';
export function mounted(fn: () => (() => void)): void { componentEffect(() => fn(), []); }
