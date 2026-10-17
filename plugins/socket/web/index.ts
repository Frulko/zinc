// zinc:socket in the browser (docs/targets/web.md, "Plugins"): a page has WebSocket, and nothing else of this module. The WebSocket client, its events and
// the ready states are the browser's; TCP, Unix and UDP sockets, DNS lookup and the WebSocket server throw ZnUnsupported (a page cannot open them).
// Use fetch for HTTP, WebSocket or WebRTC data channels for a peer, and a server of your own (or a service worker) for the rest.
const g: any = globalThis;

export const WebSocket = g.WebSocket, MessageEvent = g.MessageEvent, CloseEvent = g.CloseEvent, ErrorEvent = g.ErrorEvent;
export const CONNECTING: number = 0, OPEN_STATE: number = 1, CLOSING: number = 2, CLOSED: number = 3;

function no(what: string): never { throw new g.ZnUnsupported(what, 'a web page cannot open raw sockets or listen: use WebSocket, fetch or a WebRTC data channel'); }
export class Socket { constructor() { no('zinc:socket Socket'); } }
export class Server { constructor() { no('zinc:socket Server'); } }
export class Datagram { constructor() { no('zinc:socket Datagram'); } }
export class UdpSocket { constructor() { no('zinc:socket UdpSocket'); } }
export class UpgradeRequest { constructor() { no('zinc:socket UpgradeRequest'); } }
export class WebSocketServer { constructor() { no('zinc:socket WebSocketServer'); } }
export function connect(_host: string, _port: number): Promise<never> { return no('socket.connect'); }
export function connectUnix(_path: string): Promise<never> { return no('socket.connectUnix'); }
export function listen(_port: number, _on: unknown, _host: string = ''): Promise<never> { return no('socket.listen'); }
export function listenUnix(_path: string, _on: unknown): Promise<never> { return no('socket.listenUnix'); }
export function udp(_port: number, _host: string = ''): Promise<never> { return no('socket.udp'); }
export function lookup(_host: string): Promise<never> { return no('socket.lookup'); }
export function serveWebSocket(_port: number, _on: unknown, _host: string = ''): Promise<never> { return no('socket.serveWebSocket'); }
