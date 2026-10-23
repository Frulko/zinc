/** The system helper owns downloads and activation; the player only requests and displays them. */
export class UpdateStatus {
  current: string = '';
  previous: string = '';
  architecture: string = '';
  phase: string = 'idle';
  message: string = '';
  latest: string = '';
  versions: string[] = [];
  checking: boolean = false;
  checked: boolean = false;
  error: string = '';
  selected: string = '';
  pending: string = '';

  signature(): string {
    return this.current + '|' + this.previous + '|' + this.architecture + '|' + this.phase + '|' + this.message;
  }

  isBusy(): boolean {
    return this.phase === 'preparing' || this.phase === 'activating' || this.phase === 'queued';
  }

  hasUpdate(): boolean {
    const installed = this.current.split('.');
    const available = this.latest.split('.');
    if (installed.length < 3 || available.length < 3) return false;
    for (let i = 0; i < 3; i++) {
      const a = parseInt(available[i]);
      const b = parseInt(installed[i]);
      if (a !== b) return a > b;
    }
    return false;
  }

  read(text: string, catalog: boolean): void {
    const data: any = JSON.parse(text);
    this.current = data.current as string;
    this.previous = data.previous as string;
    this.architecture = data.architecture as string;
    this.phase = data.phase as string;
    this.message = data.message as string;
    if (catalog) {
      this.latest = data.latest as string;
      this.versions = data.versions as string[];
      this.checked = true;
      if (this.selected === '' && this.versions.length > 0) this.selected = this.versions[0];
    }
  }
}
