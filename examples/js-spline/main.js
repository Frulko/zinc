// A scene made in Spline (spline.design), run by Spline's own runtime (@splinetool/runtime, three.js inside) on the QuickJS engine with the
// web environment: the scene's camera, lights, materials, and the interactions its author drew in Spline (hover, click, keys, states).
// Run it:  tools/test-lib spline-runtime-2.0.98     (once: it downloads Spline's runtime from its npm release; it has no licence and is not
//                                                    in this repository)
//          zinc run examples/js-spline
//          SPLINE_SCENE=path/to/scene.splinecode zinc run examples/js-spline     (another scene: File > Export > Code > scene.splinecode)
//          examples/js-spline/pick.sh                                            (choose one of the scenes of assets/)
import { showFps } from './fps.js';

const home = __host_sysEnv('ZINC_HOME') || __host_sysEnv('HOME') + '/.zinc';
const RUNTIME = home + '/cache/test-libs/spline-runtime-2.0.98/runtime.standalone.webgl.js';
const SCENE = __host_sysEnv('SPLINE_SCENE') || 'assets/scene.splinecode';

let Application;
try {
  Application = (await import(RUNTIME)).Application;
} catch (err) {
  stop('cannot load Spline\'s runtime (' + err.message + '): run tools/test-lib spline-runtime-2.0.98 once, it downloads it');
}

const canvas = document.createElement('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);

// renderer 'webgl': the runtime's WebGL 2 path (no WebGPU here); htmlContentMode 'none': no HTML frames in iframes; wasmPath: a folder of the
// example, so a scene that needs WebAssembly fails here, at once, instead of downloading modules this engine cannot run
const app = new Application(canvas, { renderer: 'webgl', htmlContentMode: 'none', wasmPath: 'assets/wasm' });
let bytes;
try {
  bytes = await (await fetch(SCENE)).arrayBuffer();
} catch (err) {
  stop('cannot read the scene ' + SCENE + ' (' + err.message + ')');
}
try {
  await app.start(bytes);
} catch (err) {
  stop('Spline could not start ' + SCENE + ' (' + err.message + '). A scene with physics, booleans, bevels, subdivision ("Smooth"), ' +
    'a navmesh, Gaussian splats or Draco meshes needs WebAssembly, which the QuickJS engine does not have: see examples/js-spline/README.md');
}

// A scene saved with a fixed size (an embed of 1200 x 1000) fills the window instead, as Spline's "fullscreen" preset does.
// ponytail: _viewportMode and _resize are the runtime's own (2.0.98); app.setSize keeps the scene's frame and stretches an orthographic camera
if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
  app._viewportMode = 1; app._viewportWidth = window.innerWidth; app._viewportHeight = window.innerHeight;
  canvas.style.width = canvas.style.height = '100%';
  app._resize();
}

if (__host_sysEnv('SPLINE_FPS') !== '0') showFps(canvas);   // the frames per second, top left (SPLINE_FPS=0 hides them)

// The program talks to the scene as a web page does: what the pointer is over and what was clicked, by name, on stdout.
let hovered = '';
app.addEventListener('mouseHover', e => { if (e.target.name !== hovered) console.log('mouseHover ' + (hovered = e.target.name)); });
app.addEventListener('mouseDown', e => console.log('mouseDown ' + e.target.name));
console.log('js-spline: ' + SCENE + ', ' + app.getAllObjects().length + ' objects');

function stop(message) {
  console.error('js-spline: ' + message);
  __host_sysExit(1);
}
