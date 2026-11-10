// Museum content is checked with the player's own parser before the engine stages it, then taken only while the table is quiet.
import * as update from 'zinc:system/update';
import { readText } from 'zinc:fs';
import { parseProject } from './project';

/** Seconds between two checks; the first check is at startup. */
const EVERY = 3600;
enum UpdateState { Idle, Checking, Ready, Restarting }

export class Updates {
  private state = UpdateState.Idle;
  private wait = 0;
  constructor(private url: string, private log: (what: string) => void) {}
  get ready(): boolean { return this.state === UpdateState.Ready; }
  private transition(next: UpdateState): void {
    if (!((this.state === UpdateState.Idle && next === UpdateState.Checking) ||
          (this.state === UpdateState.Checking && (next === UpdateState.Idle || next === UpdateState.Ready)) ||
          (this.state === UpdateState.Ready && next === UpdateState.Restarting) ||
          (this.state === UpdateState.Restarting && next === UpdateState.Idle))) throw new Error('Invalid update transition');
    this.state = next;
  }
  /** Each frame; quiet means nobody is at the table and no visit is kept. */
  frame(dt: number, quiet: boolean): void {
    if (this.url.length === 0) return;
    if (this.ready) {
      if (!quiet) return;
      this.transition(UpdateState.Restarting);
      this.log('the table is idle: starting again with the new version');
      try { update.restart(); } catch (e) { this.transition(UpdateState.Idle); this.log(e.message); }
      return;
    }
    this.wait -= dt;
    if (this.state !== UpdateState.Idle || this.wait > 0) return;
    this.wait = EVERY;
    this.transition(UpdateState.Checking);
    this.check().catch((e: Error) => { this.transition(UpdateState.Idle); this.log(e.message); });
  }
  private async check(): Promise<void> {
    const info = await update.check(this.url);
    if (!info.available) {
      this.log(`museum-table ${info.version} is up to date`);
      this.transition(UpdateState.Idle);
      return;
    }
    const version = await update.download(this.url, (dir: string): void => { parseProject(readText(`${dir}/assets/project.json`)); });
    this.log(`downloaded and verified: ${version}`);
    this.transition(UpdateState.Ready);
  }
}
