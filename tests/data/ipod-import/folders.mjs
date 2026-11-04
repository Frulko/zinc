import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Exercise the app's routing without opening or writing to an iPod.
const source = readFileSync('examples/ipod/src/actions.ts', 'utf8');
const start = source.indexOf('export function addFiles(');
const end = source.indexOf('\nfunction addFilesToPlaylist(', start);
const calls = [];
let enabled = false;
const context = {
  lib: () => ({}), page: () => 'add', PAGE_ADD: 'add', allowed: () => true,
  folderPlaylists: () => enabled, addPlaylist: () => 'Chosen',
  fs: { stat: path => {
    if (path === '/missing') throw new Error('gone');
    return { isDirectory: !path.endsWith('.mp3') };
  } },
  addFilesToPlaylist: (paths, playlist) => calls.push({ paths, playlist }),
};
vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(source.slice(start, end).replace('export ', '')), context);
const paths = ['/Music/Rock/', '/Music/Jazz', '/song.mp3', '/missing'];
context.addFiles(paths);
assert.equal(JSON.stringify(calls), JSON.stringify([{ paths, playlist: 'Chosen' }]));
calls.length = 0;
enabled = true;
context.addFiles(paths);
assert.equal(JSON.stringify(calls), JSON.stringify([
  { paths: ['/Music/Rock/'], playlist: 'Rock' },
  { paths: ['/Music/Jazz'], playlist: 'Jazz' },
  { paths: ['/song.mp3', '/missing'], playlist: 'Chosen' },
]));
console.log('folder import routing: ok');
