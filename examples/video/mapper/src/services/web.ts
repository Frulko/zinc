// The web editor, served by the app itself: nothing else to install, any browser on the network edits the mapping live.
// The editor's own files are open; everything else needs the token of the URL shown on the status card (header x-zinc-token, or ?token= for what a <video> reads).
import * as assets from 'zinc:assets';
import * as fs from 'zinc:fs';
import * as mapping from 'zinc:mapping';
import { serveAsync, Request, Reply, BodyStream } from 'zinc:net';
import * as os from 'zinc:os';
import * as sys from 'zinc:sys';
import { TOKEN_FILE } from '../constants';
import { cardKind } from './cards';
import { applyCommand, isHudShown } from './control';
import { LayerCommand } from './layerCommands';
import { deleteMedia, mediaExists, mediaListJson, mediaPath, receiveMedia } from './mediaStore';
import { deleteScene, importScene, isSceneName, loadScene, newScene, saveScene, sceneJson, sceneListJson } from './scenes';
import { replaceShow, showJson } from './show';
import { soundJson } from './sound';

const JSON_TYPE = 'application/json';
const MAX_COMMANDS_BYTES = 1048576;
const CONTENT_TYPES: [string, string][] = [['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.wasm', 'application/wasm'], ['.json', 'application/json'], ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.ttf', 'font/ttf']];
// The editor is built apart (README): a Zinc program for both this page and a native client.
const NOT_BUILT = 'The editor is not built here. Run: zinc export examples/video/mapper/editor --target web -o examples/video/mapper/assets/editor\n';
const FILE_TYPES: [string, string][] = [['.mp4', 'video/mp4'], ['.m4v', 'video/mp4'], ['.webm', 'video/webm'], ['.mov', 'video/quicktime'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp']];

function jsonReply(status: i32, body: string): Reply { return { status, body, contentType: JSON_TYPE }; }
function errorReply(status: i32, message: string): Reply { return jsonReply(status, JSON.stringify({ error: message })); }

function typeOf(name: string, table: [string, string][]): string {
  const lower = name.toLowerCase();
  for (const entry of table) if (lower.endsWith(entry[0])) return entry[1];
  return 'application/octet-stream';
}

function loadToken(): string {
  if (fs.exists(TOKEN_FILE)) return fs.readText(TOKEN_FILE).trim();
  let token = '';
  for (const byte of sys.randomBytes(8)) token += (byte + 256).toString(16).slice(1);
  fs.writeText(TOKEN_FILE, token);
  return token;
}

function stateJson(): string {
  const layers: string[] = [];
  for (let i: i32 = 0; i < mapping.layerCount(); i++) layers.push(mapping.layerJson(i));
  const info = mapping.info();
  return `{"layers":[${layers.join(',')}],"hud":${isHudShown()},"card":${JSON.stringify(cardKind())},${soundJson()},${info.slice(1, info.length - 1).replace(/"layers":\d+,/, '')}}`;
}

async function readBody(req: Request): Promise<string> {
  let body = '';
  await (req.bodyStream as BodyStream).each((chunk: string) => {
    if (body.length < MAX_COMMANDS_BYTES) body += chunk;
  });
  return body;
}

/** [[address, ...args], ...] from the page; null when it is anything else. */
function parseCommands(body: string): LayerCommand[] | null {
  let list: any = null;
  try {
    list = JSON.parse(body);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const commands: LayerCommand[] = [];
  for (const message of list as any[]) {
    if (!Array.isArray(message) || typeof message[0] !== 'string' || !(message[0] as string).startsWith('/')) return null;
    const numbers: number[] = [];
    const strings: string[] = [];
    for (let i: i32 = 1; i < (message as any[]).length; i++) {
      const arg = (message as any[])[i];
      if (typeof arg === 'string') strings.push(arg as string);
      else numbers.push(arg as number);
    }
    commands.push({ address: message[0] as string, numbers, strings });
  }
  return commands;
}

function servePage(path: string): Reply | null {
  const name = `editor/${path === '/' ? 'index.html' : path.slice(1)}`;
  if (name.includes('..') || !assets.exists(name)) return path === '/' ? { status: 200, body: NOT_BUILT, contentType: 'text/plain; charset=utf-8' } : null;
  return { status: 200, body: assets.readText(name), contentType: typeOf(name, CONTENT_TYPES) };
}

async function mediaRoute(req: Request, name: string): Promise<Reply> {
  if (!mapping.isFileName(name)) return errorReply(400, 'a media name has letters, digits, - _ and . only');
  if (req.method === 'POST') {
    try {
      await receiveMedia(name, req.bodyStream as BodyStream);
    } catch (e) {
      return errorReply(507, `the upload stopped: ${e}`);
    }
    return jsonReply(200, mediaListJson());
  }
  if (req.method === 'DELETE') return deleteMedia(name) ? jsonReply(200, mediaListJson()) : errorReply(404, 'no such media');
  if (req.method !== 'GET') return errorReply(405, 'GET, POST or DELETE');
  if (!mediaExists(name)) return errorReply(404, 'no such media');
  return { status: 200, body: '', contentType: typeOf(name, FILE_TYPES), file: mediaPath(name) };
}

async function sceneRoute(req: Request, rest: string): Promise<Reply> {
  const loading = rest.endsWith('/load');
  const name = loading ? rest.slice(0, rest.length - 5) : rest;
  if (!isSceneName(name)) return errorReply(400, 'a scene name has letters, digits, - and _ only');
  if (loading) {
    if (req.method !== 'POST') return errorReply(405, 'POST');
    return loadScene(name) ? jsonReply(200, sceneListJson()) : errorReply(404, 'no such scene');
  }
  if (req.method === 'GET') {
    const scene = sceneJson(name);
    return scene === '' ? errorReply(404, 'no such scene') : jsonReply(200, scene);
  }
  if (req.method === 'DELETE') return deleteScene(name) ? jsonReply(200, sceneListJson()) : errorReply(404, 'no such scene');
  if (req.method !== 'POST') return errorReply(405, 'GET, POST or DELETE');
  // no body: the scene on now, under this name; a body: a scene file brought from elsewhere
  const body = await readBody(req);
  if (body === '') saveScene(name);
  else if (!importScene(name, body)) return errorReply(400, 'not a scene file');
  return jsonReply(200, sceneListJson());
}

async function apiRoute(req: Request, path: string): Promise<Reply> {
  if (path === '/state' && req.method === 'GET') return jsonReply(200, stateJson());
  if (path === '/osc' && req.method === 'POST') {
    const commands = parseCommands(await readBody(req));
    if (commands === null) return errorReply(400, 'expected [[address, ...args], ...]');
    for (const command of commands as LayerCommand[]) {
      if (!applyCommand(command)) console.warn(`mapper: refused ${command.address}`);
    }
    return { status: 204, body: '', contentType: JSON_TYPE };
  }
  if (path === '/scenes' && req.method === 'GET') return jsonReply(200, sceneListJson());
  if (path === '/new-scene' && req.method === 'POST') {
    newScene();
    return jsonReply(200, sceneListJson());
  }
  if (path.startsWith('/scenes/')) return sceneRoute(req, path.slice(8));
  if (path === '/media' && req.method === 'GET') return jsonReply(200, mediaListJson());
  if (path.startsWith('/media/')) return mediaRoute(req, path.slice(7));
  if (path === '/show' && req.method === 'GET') return jsonReply(200, showJson());
  if (path === '/show' && req.method === 'PUT') {
    const problem = replaceShow(await readBody(req));
    return problem === '' ? { status: 204, body: '', contentType: JSON_TYPE } : errorReply(400, problem);
  }
  return errorReply(404, 'no such route');
}

function queryToken(url: string): string {
  const at = url.indexOf('?token=');
  if (at < 0) return '';
  return url.slice(at + 7);
}

/** Serves the editor on `port`; its URL, '' when the port is taken (the mapping still runs, over OSC). */
export function startWebEditor(port: i32): string {
  const token = loadToken();
  const handle = async (req: Request): Promise<Reply> => {
    const query = req.path.indexOf('?');
    const path = query < 0 ? req.path : req.path.slice(0, query);
    if (req.method === 'GET') {
      const page = servePage(path);
      if (page !== null) return page as Reply;
    }
    if (req.headers.get('x-zinc-token') !== token && queryToken(req.path) !== token) return errorReply(401, 'wrong token');
    return apiRoute(req, path);
  };
  try {
    // a film over wifi takes minutes: the timeout is on a pause of the upload, not on its length
    serveAsync(port, handle, { streamBody: true, maxBodyBytes: 2147483647, requestTimeoutMs: 60000 });
  } catch (e) {
    console.error(`mapper: no web editor: ${e}`);
    return '';
  }
  return `http://${lanAddress()}:${port}/?token=${token}`;
}

function lanAddress(): string {
  for (const net of os.networkInterfaces()) {
    if (!net.internal && net.family === 'IPv4') return net.address;
  }
  return '127.0.0.1';
}
