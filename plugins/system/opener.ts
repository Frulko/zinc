// zinc:system/opener: open a URL or a file with the system's default app and reveal a file in the file manager. The URLs and paths allowed are listed in zinc.json
// "scopes": {"opener": {"allow": ["https://*", "mailto:"]}}: anything else is refused (docs/reports/system-integration.md 5.2).
import { call } from 'zinc:system';

export async function openUrl(url: string): Promise<void> { call('opener.open', { target: url }); }
export async function openPath(path: string): Promise<void> { call('opener.open', { target: path }); }
/** Shows the file selected in Finder / the file manager. */
export async function reveal(path: string): Promise<void> { call('opener.reveal', { path: path }); }
