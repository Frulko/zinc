// A screen on the navigation stack. Menus and (fake, for now) detail pages share this interface so main.ts only routes actions.
export class Screen {
  /** Up / Down; also paging (d = +-visible rows) and Home / End (d = +-1000). */
  move(d: i32): void {}
  /** Left / Right on the selected row. */
  cycle(d: i32): void {}
  /** Enter: the screen to push, or null. */
  open(): Screen | null { return null; }
  draw(tick: i32): void {}
}
