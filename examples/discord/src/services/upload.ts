// File upload, Discord's cloud flow (docs/reports/discord-client-research.md 3): POST /channels/{id}/attachments names the files and gives an
// upload_url for each; their bytes are PUT there (a storage bucket: no token, no identity headers); the message then names them by
// uploaded_filename. Up to 10 files a message.
// ponytail: each file is read whole in memory; stream it when files of hundreds of MB matter.
import { readBytes } from 'zinc:fs';
import { api } from './rest';

export class Upload { filename = ''; bytes: u8[] = []; }

/** A file picked or dropped, read for upload. */
export function readUpload(path: string): Upload {
  const u = new Upload();
  const parts = path.split('/');
  u.filename = parts[parts.length - 1];
  u.bytes = readBytes(path);
  return u;
}

/** Puts the files on Discord's storage; returns the `attachments` of the message that sends them. */
export async function uploadFiles(channelId: string, files: Upload[]): Promise<any[]> {
  const ask: any[] = [];
  for (let i = 0; i < files.length; i++) ask.push({ id: `${i}`, filename: files[i].filename, file_size: files[i].bytes.length });
  const r: any = await api('POST', `/channels/${channelId}/attachments`, { files: ask });
  const out: any[] = [];
  if (r === null || !Array.isArray(r.attachments)) throw new Error('no upload address');
  for (const a of r.attachments) {
    const i = parseInt(`${a.id}`), f = files[i];
    const put = await fetch(a.upload_url, { method: 'PUT', body: Blob.fromBytes(f.bytes, 'application/octet-stream') });
    if (!put.ok) throw new Error(`${f.filename}: HTTP ${put.status}`);
    out.push({ id: `${i}`, filename: f.filename, uploaded_filename: a.upload_filename });
  }
  return out;
}
