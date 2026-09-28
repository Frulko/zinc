// zinc:lottie: metadata parsed natively (C++ JSON parser) vs JSON.parse in the sim, Player timing, handles.
import * as lottie from 'zinc:lottie';

const doc = '{"v":"5.7.0","fr":29.97,"ip":0,"op":90,"w":120.5,"h":64,"assets":[{"id":"c","layers":[]}],"layers":[' +
  '{"ty":4,"ind":1,"ip":0,"op":90,"st":0,"ks":{"p":{"a":0,"k":[60,32]}},"shapes":[{"ty":"el","p":{"a":0,"k":[0,0]},"s":{"a":0,"k":[20,20]}},' +
  '{"ty":"fl","c":{"a":0,"k":[1,0,0,1]},"o":{"a":0,"k":100}},{"ty":"tm","m":1,"s":{"a":0,"k":10},"o":{"a":0,"k":0},' +
  '"e":{"a":1,"k":[{"t":0,"s":[0],"o":{"x":[0.4],"y":[0]},"i":{"x":[0.2],"y":[1]}},{"t":60,"s":[100]}]}},{"ty":"st","c":{"a":0,"k":[0,0,1,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":3}}]},{"ty":0,"refId":"c","ind":2,"ip":0,"op":90,"ks":{}},' +
  '{"ty":3,"nm":"esc \\"quoted\\" \\u00e9","ind":3,"ip":0,"op":90,"ks":{"r":{"a":1,"k":[{"t":0,"s":[0],"o":{"x":[0.4],"y":[0]},"i":{"x":[0.2],"y":[1]}},{"t":90,"s":[1e2]}]}}}]}';
const a = lottie.parse(doc);
console.log('handle', a, 'size', lottie.width(a), lottie.height(a), 'frames', lottie.frames(a), 'fps', lottie.fps(a), 'layers', lottie.layers(a));
console.log('duration', lottie.duration(a).toFixed(4));
console.log('bad json', lottie.parse('{"layers": ['), 'no layers', lottie.parse('{"w": 1}'), 'not an object', lottie.parse('[1, 2]'));
const b = lottie.parse('{"w":1,"h":1,"op":10,"layers":[]}');
console.log('second handle', b, 'default fps', lottie.fps(b));
for (let f = 0; f < 90; f += 15) lottie.draw(a, f, 0, 0, 64, 64);  // renderer smoke test (no output: headless)
lottie.free(a);
console.log('reused handle', lottie.parse('{"layers":[]}'));
console.log('missing file', lottie.load('nope/missing.json'));

const p = new lottie.Player(b);
p.play();
p.update(0.25);   // 30 fps: 7.5 frames
console.log('frame', p.frame, 'shown', p.shown(), 'playing', p.playing);
p.update(0.2);    // 13.5 -> loops to 3.5
console.log('looped', p.frame.toFixed(2));
p.loop = false; p.speed = 2;
p.update(1);
console.log('ended', p.frame.toFixed(3), p.playing);
p.segment(2, 6); p.loop = true; p.play(); p.speed = -1;
p.update(0.1);    // 2 - 3 frames, reversed and looping inside [2, 6)
console.log('segment', p.frame.toFixed(2), p.playing);
