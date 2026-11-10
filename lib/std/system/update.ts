// App updates on targets without desktop update services.
export class UpdateInfo { available = false; version = ''; notes = ''; }
export function isSupported(): boolean { return false; }
export async function check(url: string = ''): Promise<UpdateInfo> { throw new Error('App updates are unsupported on this target'); }
export async function download(url: string = '', validate: ((dir: string) => void) | null = null): Promise<string> { throw new Error('App updates are unsupported on this target'); }
export function restart(): void { throw new Error('App updates are unsupported on this target'); }
export function healthy(): void { throw new Error('App updates are unsupported on this target'); }
