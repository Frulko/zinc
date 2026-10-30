// zinc:devhooks — where a module shows its state to the inspector (plugins/devtools) without either importing the other: plugins/sqlite
// registers its open databases here in dev runs (zinc dev, ZINC_DEV=1), and zinc:devtools reads them for the Storage panel. Nothing else
// imports it; in a run that is not a dev run the lists stay empty.
import { env } from 'zinc:sys';

/** A dev run: the registrations are kept (zinc dev sets ZINC_DEV=1). */
export const devRun: boolean = env('ZINC_DEV') === '1';

/** An open SQLite database as the inspector sees it. `query` runs SQL and answers JSON: {"columns":[...],"rows":[[...]],"changes":n} or
 *  {"error":"..."}; at most `max` rows; writes refused unless `write` (the inspector asks the person first). */
export class DevDatabase {
  id: i32; path: string;
  query: (sql: string, max: i32, write: boolean) => string;
  constructor(id: i32, path: string, query: (sql: string, max: i32, write: boolean) => string) { this.id = id; this.path = path; this.query = query; }
}
export const devDatabases: DevDatabase[] = [];
let nextId: i32 = 1;
/** Registers a database (dev runs only); the id to give back to devDatabaseClosed, 0 when not kept. */
export function devDatabaseOpened(path: string, query: (sql: string, max: i32, write: boolean) => string): i32 {
  if (!devRun) return 0;
  const id = nextId++;
  devDatabases.push(new DevDatabase(id, path, query));
  return id;
}
export function devDatabaseClosed(id: i32): void {
  for (let i = 0; i < devDatabases.length; i++) if (devDatabases[i].id === id) { devDatabases.splice(i, 1); return; }
}
