import * as fs from 'zinc:fs';
import { randomBytes } from 'zinc:sys';
import { toHex } from 'zinc:web';
import { serve, Request, Reply } from 'zinc:net';
import { Group } from 'zinc:sonos';
import { Listen, Scrobble, atomic } from 'zinc:lastfm';

export interface Status {
  authorized: boolean;
  groups: Group[];
  listens: Listen[];
  pending: Scrobble[];
  rejected: Scrobble[];
  sent: number;
  retryAt: number;
  lastError: string;
}

function jsonReply(status: i32, body: unknown): Reply {
  return {
    status: status,
    body: JSON.stringify(body),
    contentType: 'application/json; charset=utf-8',
  };
}

function matchesToken(provided: string, expected: string): boolean {
  if (provided.length !== expected.length || provided.length === 0) return false;

  // Compare every character instead of stopping at the first mismatch.
  let difference = 0;
  for (let i = 0; i < provided.length; i++) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

export function startServer(port: i32, data: string, readStatus: () => Status): i32 {
  const tokenFile = data + '/admin.token';
  if (!fs.exists(tokenFile)) atomic(tokenFile, toHex(randomBytes(24)) + '\n');
  const token = fs.readText(tokenFile).trim();
  if (token.length < 32) throw new Error('Invalid admin.token');

  const bound = serve(port, (request: Request): Reply => {
    if (request.method !== 'GET') return jsonReply(405, { error: 'GET only' });
    if (request.path === '/health') {
      const status = readStatus();
      return jsonReply(200, {
        ready: true,
        authorized: status.authorized,
        groups: status.groups.length,
        pending: status.pending.length,
      });
    }
    if (!matchesToken(request.headers.get('authorization'), 'Bearer ' + token)) {
      return jsonReply(401, { error: 'Bearer token required' });
    }
    if (request.path !== '/status') return jsonReply(404, { error: 'Not found' });
    return jsonReply(200, readStatus());
  }, { hostname: '127.0.0.1', maxBodyBytes: 1024 });

  console.log('sonos-lastfm listening on http://127.0.0.1:' + bound.toString() + '; status token: ' + tokenFile);
  return bound;
}
