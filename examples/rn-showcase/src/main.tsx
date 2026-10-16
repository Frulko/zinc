// rn-showcase: a kitchen-sink app written the React Native way (React model, zinc:react-native, StyleSheet), see README.md.
//   zinc run examples/rn-showcase
// Test and screenshot hooks: SHOWCASE_SCREEN=<tab>[/<screen>] opens a route (forms, network, more/media, more/camera...), SHOWCASE_SCHEME=dark,
// SHOWCASE_LANG=fr, SHOWCASE_NET=live (real network; mock by default when deterministic or offline).
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
import { Appearance } from 'zinc:react-native';
import { env, allocations } from 'zinc:sys';
import App, { startRoute } from './App';
import { TABS } from './nav';
import { loadPrefs } from './store';

loadPrefs();
if (env('SHOWCASE_SCHEME') === 'dark' || env('SHOWCASE_SCHEME') === 'light') Appearance.setColorScheme(env('SHOWCASE_SCHEME'));
const route = env('SHOWCASE_SCREEN').split('/');
if (route[0] !== '') {
  const tab = TABS.indexOf(route[0]) >= 0 ? route[0] : 'more';
  startRoute(tab, route.length > 1 ? route.slice(1) : (TABS.indexOf(route[0]) >= 0 ? [] : [route[0]]));
}
// SHOWCASE_IDLE=n: after the first 60 frames, counts the allocations of the next n idle frames and quits (the idle budget: 0)
const idle = env('SHOWCASE_IDLE') === '' ? 0 : parseInt(env('SHOWCASE_IDLE'));
let frames = 0, from = 0;
render(App, 0xF6F3EE, idle === 0 ? null : (dt: number): void => {
  frames++;
  if (frames === 60) from = allocations();
  if (frames === 60 + idle) { console.log(`idle ${idle} frames: ${allocations() - from} allocations`); quit(); }
});
