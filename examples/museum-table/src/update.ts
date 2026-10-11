// Museum table: the museum replaces the content without touching the table (ZN-650.11). A table whose project names an address
// (`kiosk.updateUrl`) looks there for a newer version of itself: the signed channel and the .zapp that `zinc publish` writes, which hold
// the player with its project and media. Everything is the engine's: `zinc update-app` fetches the channel, checks its signature with the
// key of the table's zinc.json, downloads the package, checks its SHA-256 and stages it; the table starts again into it once nobody is
// there. A channel with a wrong signature, a package cut short or a server that does not answer stage nothing: the table plays on.
// It runs as a process of its own, so the table never waits for the network. Without an address nothing here runs.
import { env } from 'zinc:sys';
import { run, Result } from 'zinc:process';
import { restart } from 'zinc:system/update';

/** Seconds between two looks at the address; the first one is at the start. */
const EVERY = 3600;

export class Updates {
  /** A newer version is downloaded, checked and staged: the table starts again into it when it is quiet. */
  ready = false;
  private busy = false;
  private wait = 0;
  constructor(private url: string, private log: (what: string) => void) {}

  /** Each frame; `quiet` when nobody is at the table and no visit is kept. */
  frame(dt: number, quiet: boolean): void {
    if (this.url.length === 0) return;
    if (this.ready) {
      if (!quiet) return;
      this.ready = false;
      this.log('the table is idle: starting again with the new version');
      try { restart(); } catch (e) { this.log(e.message); }
      return;
    }
    this.wait -= dt;
    if (this.busy || this.wait > 0) return;
    this.wait = EVERY; this.busy = true;
    // ponytail: the engine's command line does the work, so the table is run by zinc (`zinc run table.zapp`); a fused executable has no
    // such command and needs the check as a background operation of zinc:system/update.
    run(env('ZINC_BIN'), ['update-app', '.', '--url', this.url], {}).then((r: Result) => {
      this.busy = false;
      for (const line of `${r.stdout}\n${r.stderr}`.split('\n')) if (line.length > 0) this.log(line);
      this.ready = r.code === 0 && r.stdout.includes('downloaded and verified');
    }).catch((e: Error) => { this.busy = false; this.log(e.message); });
  }
}
