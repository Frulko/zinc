// zinc:system/opener: open a URL or a file with the system's default app, reveal a file in the file manager and move one to the trash. The URLs and paths allowed are listed in zinc.json
// "scopes": {"opener": {"allow": ["https://*", "mailto:"]}}: anything else is refused (docs/reports/system-integration.md 5.2).
import { call } from 'zinc:system';

export async function openUrl(url: string): Promise<void> { call('opener.open', { target: url }); }
export async function openPath(path: string): Promise<void> { call('opener.open', { target: path }); }
/** Shows the file selected in Finder / the file manager. */
export async function reveal(path: string): Promise<void> { call('opener.reveal', { path: path }); }
/** Moves the file or folder to the system's trash (Finder's Trash on macOS, the freedesktop.org trash on Linux and in the simulator), where
 *  the person can put it back; true when it moved. False when it is missing or on a disk without a trash here, and on phones and Windows. */
export function trash(path: string): boolean { return (call('opener.trash', { path: path }) as { ok: boolean }).ok; }
