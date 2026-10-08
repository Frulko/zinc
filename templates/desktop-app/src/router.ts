// The pages of the app and where the user has been: no UI here, so the tests can drive it (tests/router.test.ts).
export const PAGES: string[] = ['Home', 'Notes', 'Settings'];
export const ICONS: string[] = ['house', 'notebook-pen', 'settings'];

export class Router {
  current: string = PAGES[0];
  history: string[] = [];
  /** Opens a page (an unknown name is ignored); the previous one goes on the history. */
  go(page: string): boolean {
    if (PAGES.indexOf(page) < 0 || page === this.current) return false;
    this.history.push(this.current);
    this.current = page;
    return true;
  }
  /** Back to the previous page; false when there is none. */
  back(): boolean {
    if (this.history.length === 0) return false;
    this.current = this.history.pop() as string;
    return true;
  }
}
