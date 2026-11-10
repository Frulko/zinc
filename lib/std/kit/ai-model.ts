// Presentation rules shared by assistant controls; requests and conversation state belong to callers.
export enum AiStatus { Pending, Running, Done, Failed, Skipped }
export enum DisclosureMode { Automatic, Open, Closed }

export function disclosureOpen(mode: DisclosureMode, automatic: boolean): boolean {
  return mode === DisclosureMode.Automatic ? automatic : mode === DisclosureMode.Open;
}
export function toggleDisclosure(mode: DisclosureMode, automatic: boolean): DisclosureMode {
  return disclosureOpen(mode, automatic) ? DisclosureMode.Closed : DisclosureMode.Open;
}
export function aiStatusLabel(status: AiStatus): string {
  if (status === AiStatus.Running) return 'Running';
  if (status === AiStatus.Done) return 'Completed';
  if (status === AiStatus.Failed) return 'Failed';
  if (status === AiStatus.Skipped) return 'Skipped';
  return 'Pending';
}
export function contextPercent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, used * 100 / limit));
}
export function contextTone(used: number, limit: number): string {
  const percent = contextPercent(used, limit);
  return percent >= 95 ? 'danger' : percent >= 80 ? 'warning' : 'normal';
}
/** A display label, not a URL validator; activation always returns the original source to the caller. */
export function sourceHost(url: string): string {
  let host = url.trim();
  const scheme = host.indexOf('://');
  if (scheme >= 0) host = host.slice(scheme + 3);
  let end = host.length;
  for (const separator of ['/', '?', '#']) {
    const at = host.indexOf(separator);
    if (at >= 0 && at < end) end = at;
  }
  host = host.slice(0, end);
  const credentials = host.lastIndexOf('@');
  if (credentials >= 0) host = host.slice(credentials + 1);
  if (host.startsWith('www.')) host = host.slice(4);
  return host === '' ? 'Local source' : host;
}
