import { Animation, Frame } from 'zinc:sprite';
import { Playback, PlaybackState, Sprite, Scene, SceneController, SceneState, loadTileMap, TileMap, Level, Layer, MapObject, Properties, Camera, ShakeState, InputActions } from 'zinc:game';
function check(value: boolean): void { if (!value) throw new Error('game assertion'); }
const a = new Frame('a', -1, 0, 0, 2, 2, 0, 0, 2, 2, 1, 0.5, 0.5, 100);
const b = new Frame('b', -1, 0, 0, 2, 2, 0, 0, 2, 2, 1, 0.5, 0.5, 200);
let invalid = false;
try { new Animation('empty', 'forward', []); } catch (e) { invalid = true; }
check(invalid);
invalid = false;
const bad = new Frame('bad', -1, 0, 0, 2, 2, 0, 0, 2, 2, 1, 0.5, 0.5, 0);
try { new Animation('bad', 'forward', [bad]); } catch (e) { invalid = true; }
check(invalid);
const animation = new Animation('walk', 'forward', [a, b]);
const playback = new Playback(animation);
check(playback.frame() === a);
playback.update(0.1); check(playback.frame() === b);
playback.pause(); playback.update(5); check(playback.milliseconds === 100);
playback.resume(); playback.update(3.2); check(playback.frame() === a);
playback.restart(); check(playback.milliseconds === 0);
const once = new Playback(animation, false);
once.update(20); check(once.state === PlaybackState.Finished && once.frame() === b);
once.restart(); check(once.state === PlaybackState.Playing && once.frame() === a);
const sprite = new Sprite(a); sprite.playback = playback;
sprite.update(0.1); check(sprite.frame === b);
animation.set('reverse', [a, b]); playback.restart(); check(playback.frame() === b);
animation.set('pingpong', [a, b]); playback.restart(); check(playback.frame() === a);
const c = new Frame('c', -1, 0, 0, 2, 2, 0, 0, 2, 2, 1, 0.5, 0.5, 50);
animation.set('pingpong', [a, b, c]); playback.restart();
playback.update(0.3); check(playback.frame() === c);
playback.update(0.05); check(playback.frame() === b);
playback.update(0.2); check(playback.frame() === a);
invalid = false;
try { playback.update(-1); } catch (e) { invalid = true; }
check(invalid && playback.frame() === a);
class TestScene extends Scene {
  events = ''; fail = true;
  override enter(): void { this.events += 'e'; }
  override update(seconds: number): void { this.events += 'u'; if (this.fail) throw new Error('hook'); }
  override draw(): void { this.events += 'd'; }
  override leave(): void { this.events += 'l'; }
}
const scene = new TestScene(), controller = new SceneController(scene);
controller.start();
let rejected = false;
try { controller.start(); } catch (e) { rejected = true; }
check(rejected && controller.state === SceneState.Active);
try { controller.update(0.1); } catch (e) {}
check(controller.state === SceneState.Active);
scene.fail = false; controller.update(0.1); controller.draw(); controller.stop();
check(scene.events === 'euudl' && controller.state === SceneState.Idle);
controller.start(); controller.stop();
class FailingScene extends Scene {
  mode: i32 = 0;
  owner: SceneController | null = null;
  override enter(): void { if (this.mode === 0) throw new Error('enter'); }
  override update(seconds: number): void {
    const owner = this.owner;
    if (owner !== null) owner.stop();
  }
  override draw(): void { if (this.mode === 1) throw new Error('draw'); }
  override leave(): void { if (this.mode === 2) throw new Error('leave'); }
}
const failing = new FailingScene(), guarded = new SceneController(failing);
failing.owner = guarded;
try { guarded.start(); } catch (e) {}
check(guarded.state === SceneState.Idle);
failing.mode = 1; guarded.start();
try { guarded.update(0); } catch (e) {}
check(guarded.state === SceneState.Active);
try { guarded.draw(); } catch (e) {}
check(guarded.state === SceneState.Active);
failing.mode = 2;
try { guarded.stop(); } catch (e) {}
check(guarded.state === SceneState.Idle);
failing.mode = 3; guarded.start(); guarded.draw(); guarded.stop();
class RecordingFrame extends Frame {
  result = '';
  constructor() { super('record', -1, 0, 0, 2, 2, 0, 0, 2, 2, 1, 0.5, 0.5, 100); }
  override draw(x: number, y: number, w: number = 0, h: number = 0, alpha: i32 = 255, flags: i32 = 0, rotation: number = 0, tint: u32 = 0xffffff, blend: i32 = 0): void {
    this.result = `${x}/${y}/${w}/${h}/${alpha}/${flags}/${rotation}/${tint}/${blend}`;
  }
}
const recording = new RecordingFrame(), drawing = new Sprite(recording);
drawing.x = 3; drawing.y = 4; drawing.width = 5; drawing.height = 6;
drawing.alpha = 7; drawing.flags = 3; drawing.rotation = 0.5; drawing.tint = 255; drawing.blend = 2;
drawing.draw(); check(recording.result === '3/4/5/6/7/3/0.5/255/2');
a.copy(b); check(playback.frame() === a && a.duration === 200);
const properties = new Properties(); properties.add('solid', 'bool', 'true');
check(properties.bool('solid'));
const map = new TileMap('empty'), level = new Level(map, 'room', 0, 0, 16, 16, -1);
map.levels.push(level);
const layer = new Layer('walls', 1, 1, 16, 16, 0, 0, 1, true, 1, 1, 0xffffff);
layer.values.push(1); level.layers.push(layer);
const object = new MapObject('1', 'spawn', 'Player', 'point', 4, 5, 0, 0, 0, 0, []);
level.objects.push(object);
check(map.level() === level && level.layer('walls').value(0, 0) === 1 && level.objects[0].type === 'Player');
invalid = false;
try { loadTileMap('missing.tmj'); } catch (e) { invalid = true; }
check(invalid);
const camera = new Camera(100, 80);
camera.follow(150, 100); check(camera.x === 100 && camera.y === 60);
camera.bounds(200, 160); camera.follow(999, -999); check(camera.x === 100 && camera.y === 0);
camera.bounds(20, 10); check(camera.x === -40 && camera.y === -35);
camera.shake(1, 4); camera.update(0.1);
check(Math.abs(camera.viewX - camera.x) <= 4 && Math.abs(camera.viewY - camera.y) <= 4);
camera.update(1); check(camera.shakeState === ShakeState.Idle && camera.viewX === camera.x);
camera.shake(2, 8); camera.update(0.1); camera.shake(1, 2);
check(camera.viewX === camera.x); camera.reset(); check(camera.shakeState === ShakeState.Idle);
invalid = false; try { camera.update(-1); } catch (e) { invalid = true; } check(invalid);
invalid = false; try { camera.shake(Infinity, 1); } catch (e) { invalid = true; } check(invalid);
invalid = false; try { new Camera(0, 1); } catch (e) { invalid = true; } check(invalid);
camera.viewport(10, 8); camera.follow(10, 5); check(camera.x === 5 && camera.y === 1);
invalid = false; try { camera.viewport(NaN, 1); } catch (e) { invalid = true; } check(invalid && camera.x === 5);
const bindings = new InputActions();
invalid = false; try { bindings.add().key(''); } catch (e) { invalid = true; } check(invalid);
invalid = false; try { bindings.add().pointer(5); } catch (e) { invalid = true; } check(invalid);
console.log('game: ok');
