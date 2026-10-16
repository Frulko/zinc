// The app's network client: every call of the app goes through here. Two modes:
//  - live: JSONPlaceholder over HTTPS (fetch), a real public JSON API;
//  - mock: the same answers made up in the app, after a short delay. It is the default under ZINC_DETERMINISTIC (tests and screenshots are stable),
//    with SHOWCASE_NET=mock, and the way out offered when a live call fails (offline). `failing` makes the next calls fail (to see the error states).
import { env } from 'zinc:sys';

const BASE = 'https://jsonplaceholder.typicode.com';
const AUTHORS: string[] = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia'];
const TITLES: string[] = ['Ten small things that make an app feel native', 'Why springs beat easing curves', 'Lists that scroll at 60 fps on a 2012 tablet',
  'Designing for the first run', 'Offline first, without the ceremony', 'A dark theme that is not just inverted', 'Forms people finish',
  'What a frame budget really buys you', 'Shipping one app to five screens', 'Gestures that forgive', 'The case for boring navigation',
  'Fonts, glyphs and the cost of a first paint', 'Empty states that help', 'Toasts, alerts or banners?', 'Measuring memory on a modest machine',
  'Accessible labels in five minutes', 'Retry, but kindly', 'Skeletons over spinners', 'A settings screen that respects people', 'Sockets for live data'];
const SENTENCES: string[] = ['Start with the smallest screen you support.', 'Measure before you optimise, then measure again.', 'Every state deserves a design: loading, empty, error.',
  'Keep the idle frame free of work.', 'A list only needs the rows you can see.', 'People notice latency long before they notice pixels.',
  'Write the copy first; the layout follows.', 'Defaults matter more than options.', 'Let the platform do what it already does well.']
export const PAGE = 20, TOTAL = 100;

export class Post {
  id: number; userId: number; title: string; body: string;
  constructor(id: number, userId: number, title: string, body: string) { this.id = id; this.userId = userId; this.title = title; this.body = body; }
  author(): string { return AUTHORS[(this.userId - 1) % AUTHORS.length]; }
}
export class SignUp {
  name: string; email: string; password: string; phone: string; birthday: string; country: string; interests: string; plan: number; bio: string; seats: number;
  constructor(name: string, email: string, password: string, phone: string, birthday: string, country: string, interests: string, plan: number, bio: string, seats: number) {
    this.name = name; this.email = email; this.password = password; this.phone = phone; this.birthday = birthday; this.country = country;
    this.interests = interests; this.plan = plan; this.bio = bio; this.seats = seats;
  }
}

function sentences(seed: number, n: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(SENTENCES[(seed * 5 + i * 7) % SENTENCES.length]);
  return out.join(' ');
}
function mockPost(id: number): Post {
  const n = Math.floor((id - 1) / TITLES.length);
  return new Post(id, 1 + (id - 1) % 10, TITLES[(id - 1) % TITLES.length] + (n > 0 ? ` (part ${n + 1})` : ''), sentences(id, 3 + id % 3));
}

/** A promise that settles after `ms` (the mock's latency). */
function later<T>(ms: number, f: () => T): Promise<T> {
  return new Promise<T>((resolve: (v: T) => void, reject: (e: Error) => void): void => {
    setTimeout((): void => { try { resolve(f()); } catch (e) { reject(e as Error); } }, ms);
  });
}

class Api {
  mock: boolean = env('ZINC_DETERMINISTIC') === '1' || env('SHOWCASE_NET') === 'mock';
  failing: boolean = false;
  offline: boolean = false;   // switched to the mock because the device is offline
  calls: number = 0;
  live(): boolean { return !this.mock; }
  private check(): void { if (this.failing) throw new Error('The server did not answer (simulated).'); }

  /** One page of posts, 1-based. */
  async posts(page: number): Promise<Post[]> {
    this.calls++;
    if (!this.mock && !navigator.onLine) { this.mock = true; this.offline = true; }   // no network interface up: the mock, with a banner
    if (this.mock) return await later<Post[]>(400, (): Post[] => {
      this.check();
      const out: Post[] = [];
      for (let id = (page - 1) * PAGE + 1; id <= Math.min(TOTAL, page * PAGE); id++) out.push(mockPost(id));
      return out;
    });
    this.check();
    const r = await fetch(`${BASE}/posts?_page=${page}&_limit=${PAGE}`, { timeoutMs: 8000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = JSON.parse(await r.text());
    const out: Post[] = [];
    const n = data.length as number;
    for (let i = 0; i < n; i++) { const o = data[i]; out.push(new Post(o.id as number, o.userId as number, o.title as string, o.body as string)); }
    return out;
  }

  /** Sends the sign-up form; resolves with the server's greeting. */
  async signUp(f: SignUp): Promise<string> {
    this.calls++;
    if (this.mock) return await later<string>(700, (): string => { this.check(); return `Account #${1000 + f.name.length * 7 + f.seats} created for ${f.email} (mock server).`; });
    this.check();
    const body = `{"name":${JSON.stringify(f.name)},"email":${JSON.stringify(f.email)},"plan":${f.plan},"seats":${f.seats},"country":${JSON.stringify(f.country)}}`;
    const r = await fetch(`${BASE}/users`, { method: 'POST', body: body, headers: new Headers([['Content-Type', 'application/json']]), timeoutMs: 8000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const o = JSON.parse(await r.text());
    return `Account #${o.id as number} created for ${f.email}.`;
  }

  /** Saves the settings on the server. */
  async saveSettings(nickname: string, digest: boolean): Promise<string> {
    this.calls++;
    if (this.mock) return await later<string>(500, (): string => { this.check(); return 'ok'; });
    this.check();
    const r = await fetch(`${BASE}/users/1`, { method: 'PATCH', body: `{"username":${JSON.stringify(nickname)},"digest":${digest}}`, timeoutMs: 8000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return 'ok';
  }
}
export const api = new Api();
