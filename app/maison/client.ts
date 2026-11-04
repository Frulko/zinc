import { WebSocket, MessageEvent, CloseEvent, ErrorEvent } from 'zinc:socket';
import { str, num } from '../figma-live/model';
function object(v: any): boolean { return typeof v === 'object' && v !== null && !Array.isArray(v); }
export class Entity {
  id: string; name: string; state: string = 'unavailable'; domain: string;
  attributes: any = {};
  constructor(id: string) { this.id = id; this.name = id; this.domain = id.split('.')[0]; }
  numeric(name: string, fallback: number = 0): number { return num(this.attributes[name],fallback); }
  text(name: string, fallback: string = ''): string { return str(this.attributes[name],fallback); }
  available(): boolean { return this.state !== 'unavailable' && this.state !== 'unknown'; }
}
export function websocketURL(address: string): string {
  const u = new URL(address.trim());
  if (!['http:','https:','ws:','wss:'].includes(u.protocol) || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') throw new Error('Entrez une adresse HTTP(S) Home Assistant sans identifiants ni paramètres.');
  let path = u.pathname; while (path.endsWith('/')) path = path.slice(0,path.length-1);
  if (!path.endsWith('/api/websocket')) path += '/api/websocket';
  return (u.protocol === 'https:' || u.protocol === 'wss:' ? 'wss://' : 'ws://') + u.host + path;
}
export class HomeAssistant {
  entities: Map<string, Entity> = new Map<string, Entity>();
  ready: boolean = false;
  status: string = 'Mode démo';
  send: ((text: string) => boolean) | null = null;
  changed: ((entity: Entity) => void) | null = null;
  structure: (() => void) | null = null;
  statusChanged: (() => void) | null = null;
  commands: number = 0; updates: number = 0;
  private token: string;
  private socket: WebSocket | null = null;
  private serial: i32 = 0;
  private first: boolean = true;
  private pending: Map<i32, i32> = new Map<i32, i32>();
  private stopped: boolean = true;
  private retry: i32 = 0;
  private heartbeat: i32 = 0;
  private address: string = '';
  constructor(token: string = '') { this.token = token; }
  private notify(status: string): void { this.status = status; if (this.statusChanged !== null) (this.statusChanged as () => void)(); }
  connect(address: string, token: string): void {
    const url = websocketURL(address);
    if (token.trim().length === 0) throw new Error('Entrez votre jeton d’accès Home Assistant.');
    this.disconnect(); this.address = url; this.token = token.trim(); this.stopped = false; this.open();
  }
  private open(): void {
    if (this.stopped) return;
    this.notify('Connexion à Home Assistant…'); this.ready = false; this.first = true;
    const ws = new WebSocket(this.address); this.socket = ws;
    this.send = (text: string): boolean => ws.send(text);
    ws.onmessage = (event: MessageEvent): void => { if (this.socket === ws) this.receive(event.data); };
    ws.onerror = (event: ErrorEvent): void => { if (this.socket === ws) this.notify('Connexion interrompue. Vérifiez l’adresse et le réseau.'); };
    ws.onclose = (event: CloseEvent): void => {
      if (this.socket !== ws || this.stopped) return;
      this.ready = false; this.clearPending(); this.notify('Hors ligne · reconnexion…');
      if (this.heartbeat !== 0) { clearInterval(this.heartbeat); this.heartbeat = 0; }
      this.retry = setTimeout((): void => this.open(),3000);
    };
  }
  private wire(message: any): boolean { return this.send !== null && (this.send as (text: string) => boolean)(JSON.stringify(message)); }
  receive(text: string): void {
    let m: any = null;
    try { m = JSON.parse(text); } catch (e) { this.notify('Réponse Home Assistant invalide.'); return; }
    if (Array.isArray(m)) { for (const item of m) this.receive(JSON.stringify(item)); return; }
    if (!object(m)) return;
    const type = str(m.type);
    if (type === 'auth_required') { this.wire({type:'auth',access_token:this.token}); return; }
    if (type === 'auth_invalid') { this.disconnect(); this.notify('Jeton refusé. Corrigez-le dans Réglages.'); return; }
    if (type === 'auth_ok') {
      this.ready = true; this.notify('Home Assistant connecté');
      this.wire({id:++this.serial,type:'subscribe_entities'});
      if (this.socket !== null) this.heartbeat = setInterval((): void => { if (this.ready) this.wire({id:++this.serial,type:'ping'}); },30000);
      return;
    }
    if (type === 'result') {
      const id = num(m.id) as i32;
      const timer = this.pending.get(id); if (timer !== undefined) { clearTimeout(timer); this.pending.delete(id); }
      if (m.success === false) this.notify('Commande refusée : ' + (object(m.error) ? str(m.error.message,'erreur Home Assistant') : 'erreur Home Assistant'));
      return;
    }
    if (type !== 'event' || !object(m.event)) return;
    const event = m.event;
    let structural = false;
    if (object(event.a)) {
      const ids: string[] = []; for (const id in event.a) ids.push(id);
      if (this.first) {
        const removed: string[] = [];
        for (const id of this.entities.keys()) if (!ids.includes(id)) removed.push(id);
        for (const id of removed) { this.entities.delete(id); structural = true; }
        this.first = false;
      }
      for (const id of ids) {
        if (!/^[a-z_]+\.[a-z0-9_]+$/.test(id)) continue;
        let entity = this.entities.get(id);
        if (entity === undefined) { entity = new Entity(id); this.entities.set(id,entity); structural = true; }
        entity.attributes = {}; this.patch(entity,event.a[id]);
      }
    }
    if (object(event.c)) for (const id in event.c) {
      const entity = this.entities.get(id); if (entity === undefined) continue;
      const change = event.c[id]; if (!object(change)) continue;
      const minus = change['-'];
      if (object(minus) && Array.isArray(minus.a)) for (const key of minus.a) entity.attributes[str(key)] = undefined;
      this.patch(entity,change['+']);
    }
    if (Array.isArray(event.r)) for (const id of event.r) { this.entities.delete(str(id)); structural = true; }
    if (structural && this.structure !== null) (this.structure as () => void)();
  }
  private patch(entity: Entity, value: any): void {
    if (object(value)) {
      if (typeof value.s === 'string') entity.state = value.s;
      if (object(value.a)) for (const key in value.a) entity.attributes[key] = value.a[key];
    }
    entity.name = entity.text('friendly_name',entity.id); this.updates++;
    if (this.changed !== null) (this.changed as (entity: Entity) => void)(entity);
  }
  command(entity: Entity, service: string, data: any): boolean {
    if (!this.ready || !entity.available()) { this.notify('Cet appareil est indisponible.'); return false; }
    if (this.pending.size >= 64) { this.notify('Trop de commandes en attente.'); return false; }
    const id = ++this.serial;
    if (!this.wire({id:id,type:'call_service',domain:entity.domain,service:service,target:{entity_id:entity.id},service_data:data})) { this.notify('Connexion interrompue.'); return false; }
    const timer = setTimeout((): void => { this.pending.delete(id); this.notify('Commande sans réponse. Vérifiez la connexion.'); },10000);
    this.pending.set(id,timer); this.commands++; return true;
  }
  private clearPending(): void { for (const timer of this.pending.values()) clearTimeout(timer); this.pending.clear(); }
  disconnect(): void {
    this.stopped = true; this.ready = false; this.token = ''; this.send = null; this.clearPending();
    if (this.retry !== 0) { clearTimeout(this.retry); this.retry = 0; }
    if (this.heartbeat !== 0) { clearInterval(this.heartbeat); this.heartbeat = 0; }
    const ws = this.socket; this.socket = null; if (ws !== null) ws.close();
  }
}
