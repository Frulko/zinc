// The app frame: a slim title bar (the page's title, the uptime, the frame rate), one container per page (its objects built when it is
// shown, deleted when it is left), and the bottom navigation bar.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_BACKGROUND, COLOR_BORDER, COLOR_CARD, COLOR_MUTED, COLOR_MUTED_TEXT, COLOR_TEXT, GAP, NAV_H,
         PAGE_BENCH, PAGE_INFO, PAGE_INPUT, PAGE_LOTTIE, SYMBOL_AUDIO, SYMBOL_CHARGE, SYMBOL_HOME, SYMBOL_IMAGE, SYMBOL_LIST,
         SYMBOL_SETTINGS, TITLE_H } from '../constants';
import { badge, text } from './ui';

export class PageInfo {
  title: string; label: string; icon: string;
  constructor(title: string, label: string, icon: string) { this.title = title; this.label = label; this.icon = icon; }
}
export const PAGES: PageInfo[] = [
  new PageInfo('Dashboard', 'Home', SYMBOL_HOME),
  new PageInfo('Controls', 'Input', SYMBOL_LIST),
  new PageInfo('Now playing', 'Music', SYMBOL_AUDIO),
  new PageInfo('Lottie', 'Lottie', SYMBOL_IMAGE),
  new PageInfo('Benchmark', 'Bench', SYMBOL_CHARGE),
  new PageInfo('System', 'Info', SYMBOL_SETTINGS),
];

/** The shell of the display's current size (lv.width(), lv.height()): built again when it turns. */
export class Shell {
  navItem: i32 = 0;
  title: i32 = 0;
  uptime: i32 = 0;
  fps: i32 = 0;
  pages: i32[] = [];
  icons: i32[] = [];
  labels: i32[] = [];
  indicator: i32 = 0;
  items: i32[] = [];
}

/** A page's container: a column under the title bar, scrollable or not. */
function pageBox(screen: i32, scrolls: boolean): i32 {
  const p = lv.obj(screen);
  lv.size(p, lv.width(), lv.height() - TITLE_H - NAV_H);
  lv.pos(p, 0, TITLE_H);
  lv.style(p, lv.BG_OPA, 0, 0);
  lv.style(p, lv.BORDER_WIDTH, 0, 0);
  lv.radius(p, 0, 0);
  lv.pad(p, GAP);
  lv.gap(p, GAP, GAP);
  lv.flex(p, lv.FLEX_COLUMN, lv.FLEX_START, lv.FLEX_START);
  lv.flag(p, lv.FLAG_SCROLLABLE, scrolls);
  lv.hidden(p, true);
  return p;
}

export function buildShell(): Shell {
  const s = new Shell();
  const screen = lv.screen();
  lv.bg(screen, COLOR_BACKGROUND, 0);
  lv.flag(screen, lv.FLAG_SCROLLABLE, false);
  const landscape = lv.width() > lv.height();   // the pages are taller than the screen: every one scrolls
  for (let i = 0; i < PAGES.length; i++) s.pages.push(pageBox(screen, landscape || i === PAGE_INPUT || i === PAGE_LOTTIE || i === PAGE_BENCH || i === PAGE_INFO));
  s.navItem = Math.floor(lv.width() / PAGES.length);

  const bar = lv.obj(screen);
  lv.size(bar, lv.width(), TITLE_H);
  lv.pos(bar, 0, 0);
  lv.bg(bar, COLOR_CARD, 0);
  lv.radius(bar, 0, 0);
  lv.style(bar, lv.BORDER_WIDTH, 1, 0);
  lv.style(bar, lv.BORDER_SIDE, lv.BORDER_BOTTOM, 0);
  lv.color(bar, lv.BORDER_COLOR, COLOR_BORDER, 0);
  lv.style(bar, lv.PAD_LEFT, 10, 0);
  lv.style(bar, lv.PAD_RIGHT, 6, 0);
  lv.style(bar, lv.PAD_TOP, 0, 0);
  lv.style(bar, lv.PAD_BOTTOM, 0, 0);
  lv.gap(bar, 6, 6);
  lv.flex(bar, lv.FLEX_ROW, lv.FLEX_START, lv.FLEX_CENTER);
  lv.flag(bar, lv.FLAG_SCROLLABLE, false);
  s.title = text(bar, PAGES[0].title, 14, COLOR_TEXT);
  lv.grow(s.title, 1);
  s.uptime = text(bar, '0:00', 12, COLOR_MUTED_TEXT);
  s.fps = badge(bar, '-- fps', COLOR_MUTED, COLOR_TEXT);

  const nav = lv.obj(screen);
  lv.size(nav, lv.width(), NAV_H);
  lv.align(nav, lv.ALIGN_BOTTOM_MID, 0, 0);
  lv.bg(nav, COLOR_CARD, 0);
  lv.radius(nav, 0, 0);
  lv.style(nav, lv.BORDER_WIDTH, 1, 0);
  lv.style(nav, lv.BORDER_SIDE, lv.BORDER_TOP, 0);
  lv.color(nav, lv.BORDER_COLOR, COLOR_BORDER, 0);
  lv.pad(nav, 0);
  lv.flag(nav, lv.FLAG_SCROLLABLE, false);
  for (let i = 0; i < PAGES.length; i++) {
    const item = lv.obj(nav);
    lv.size(item, s.navItem, NAV_H);
    lv.pos(item, i * s.navItem, 0);
    lv.style(item, lv.BG_OPA, 0, 0);
    lv.style(item, lv.BORDER_WIDTH, 0, 0);
    lv.radius(item, 0, 0);
    lv.pad(item, 0);
    lv.gap(item, 0, 0);
    lv.flex(item, lv.FLEX_COLUMN, lv.FLEX_CENTER, lv.FLEX_CENTER);
    lv.flag(item, lv.FLAG_SCROLLABLE, false);
    lv.flag(item, lv.FLAG_CLICKABLE, true);
    s.icons.push(text(item, PAGES[i].icon, 14, COLOR_MUTED_TEXT));
    s.labels.push(text(item, PAGES[i].label, 12, COLOR_MUTED_TEXT));
    s.items.push(item);
  }
  s.indicator = lv.obj(nav);
  lv.size(s.indicator, 24, 2);
  lv.bg(s.indicator, COLOR_ACCENT, 0);
  lv.style(s.indicator, lv.BORDER_WIDTH, 0, 0);
  lv.radius(s.indicator, 1, 0);
  return s;
}

/** Shows page `i` and hides the one shown. */
export function showPage(s: Shell, from: i32, i: i32): void {
  if (from >= 0) {
    lv.hidden(s.pages[from], true);
    lv.textColor(s.icons[from], COLOR_MUTED_TEXT, 0);
    lv.textColor(s.labels[from], COLOR_MUTED_TEXT, 0);
  }
  lv.hidden(s.pages[i], false);
  lv.textColor(s.icons[i], COLOR_ACCENT, 0);
  lv.textColor(s.labels[i], COLOR_ACCENT, 0);
  lv.pos(s.indicator, i * s.navItem + (s.navItem - 24) / 2, 0);
  lv.setText(s.title, PAGES[i].title);
}
