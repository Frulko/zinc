// Webcam: a small camera app on zinc:camera (docs/plugins/camera.md), in the React model. See README.md.
//   cd next && build/zinc run ../examples/webcam
// Keys: Space takes a photo, M mirrors, C switches camera, F fits or fills, arrows browse the viewer, Esc closes the viewer then the app.
// Test and screenshot hooks: WEBCAM_DEMO_PERMISSION=undetermined|denied|granted stands in for the system's answer, WEBCAM_LOG=1 prints what
// happens (tests/t1/webcam_demo.sh), ZINC_SCHEME=dark the dark scheme.
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit, width, height } from 'zinc:gfx';
import App, { shoot } from './App';
import { session } from './session';

ui.onKey((e: ui.KeyEvent): void => {
  if (e.primary || e.alt) return;
  const s = session, k = e.key;
  if (k === 'Escape') { if (s.viewing >= 0) s.view(-1); else { s.close(); quit(); } }
  else if (s.viewing >= 0 && (k === 'ArrowLeft' || k === 'ArrowRight')) s.browse(k === 'ArrowLeft' ? -1 : 1);
  else if (s.stage !== 'live') return;
  else if (k === ' ') shoot();
  else if (k === 'm') s.toggleMirror();
  else if (k === 'c') s.switchCamera();
  else if (k === 'f') s.toggleFit();
  else return;
  e.preventDefault();
});

// the layout follows the window's shape (side column in landscape, sheet in portrait): a new size re-renders once
let shownW = -1, shownH = -1;
render(App, 0x09090B, (dt: number): void => {
  if (width() === shownW && height() === shownH) return;
  shownW = width(); shownH = height();
  session.changed();
});
