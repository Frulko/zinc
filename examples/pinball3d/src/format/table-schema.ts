// The table format, version 1: every field a table file may hold, with its default, its limits and what it means.
// This file is the format: the loader validates with it, the saver orders and trims with it, docs/pinball-table-format.md is
// printed from it (tools/format-doc.ts), and an editor reads it to build its forms. Changing a default or a meaning
// here changes the format: bump VERSION when files written before would read differently.
//
// Conventions: lengths in centimetres; the top view has x to the right and y down the table, towards the player, with
// the origin at the top left corner of the playfield; z is the height above the playfield. Angles are degrees in the top
// view, 0 along +x and 90 along +y (down the table). Speeds are cm/s.
import { Schema } from './schema';

export const FORMAT = 'zinc-pinball-table';
export const VERSION = 1;

/** What a rule can listen to: element events, then the game's own (from "game"). */
export const EVENTS = ['hit', 'down', 'roll', 'spin', 'capture', 'eject', 'enter', 'exit', 'pass', 'flip', 'launch',
  'start', 'ballStart', 'drain', 'ballSaved', 'tilt', 'missionDone', 'rankUp', 'multiballStart', 'multiballEnd', 'jackpot', 'extraBall', 'gameOver'];

const ELEMENTS = 'elements', GROUPS = 'groups', ANY = 'elements|groups|game';

function soundsOf(owner: string, names: string[], docs: string[]): Schema {
  const s = new Schema(`${owner} sounds`, `The sound of each event of a ${owner} (names of \`sounds\`); an event without a name is silent.`);
  for (let i = 0; i < names.length; i++) s.ref(names[i], 'sounds', docs[i]);
  s.sample = `"sounds": { "${names[0]}": "clack" }`;
  return s;
}

/** The fields every element starts with. */
function element(s: Schema, what: string): void {
  s.id(ELEMENTS, `The name of the ${what}: rules, the editor and the event log use it. Unique among all the elements of the table.`);
  s.text('group', '', 'A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes").');
}
function body(s: Schema, surface: string, look: string): void {
  s.ref('surface', 'surfaces', `What the ball feels: friction and bounce. ${surface}`);
  s.ref('look', 'looks', `What it looks like. ${look}`);
}

export function tableSchema(): Schema {
  // ---------------------------------------------------------------- materials
  const surface = new Schema('surface', 'A surface as the ball feels it. Elements name one in their `surface`.');
  surface.id('surfaces', 'Its name.');
  surface.num('friction', 0.3, 'Grip, 0 (ice) to 1 (rubber). Of two things in contact the friction is the geometric mean.').range(0, 2);
  surface.num('restitution', 0.4, 'Bounce, 0 (dead) to 1 (loses nothing). Of two things in contact the larger counts.').range(0, 1.2);

  const look = new Schema('look', 'A material as the eye sees it. Elements name one in their `look`.');
  look.id('looks', 'Its name.');
  look.color('color', '#b0b8c0', 'The base colour.');
  look.choice('shading', ['smooth', 'flat', 'unlit'], 'smooth: lit, rounded; flat: lit, faceted; unlit: the colour as it is (signs, glowing parts).');
  look.color('specular', '#000000', 'The colour of the highlights (metal, glass); black for none.');
  look.num('shininess', 30, 'How tight the highlights are: 5 is satin, 200 is chrome.').range(1, 1000);
  look.color('glow', '#000000', 'The colour the element takes when it is lit (a bumper that fires, a target that is the next step of a mission); black: it does not light.');
  look.asset('texture', 'An image of the table folder mapped on the element (PNG or JPEG).');

  const sound = new Schema('sound', 'A sound: a recorded file of the table folder, or a tone generated when the table loads. Elements name one per event in their `sounds`.');
  sound.id('sounds', 'Its name.');
  sound.asset('file', 'A WAV, FLAC, MP3 or Ogg Vorbis file of the table folder. Empty: the sound is the generated tone below.');
  sound.choice('wave', ['sine', 'square', 'triangle', 'sawtooth', 'noise'], 'The shape of the generated tone.');
  sound.num('hz', 440, 'The pitch of the generated tone.').range(20, 20000);
  sound.num('seconds', 0.1, 'The length of the generated tone.').range(0.01, 60);
  sound.num('volume', 1, 'How loud it plays, 1 as recorded.').range(0, 4);
  sound.num('volumeVariation', 0, 'Each play is louder or softer by up to this share (0.2: 80 % to 120 %), so that repeated hits do not sound stamped.').range(0, 1);
  sound.num('pitch', 1, 'How fast it plays: 2 is an octave up.').range(0.25, 4);
  sound.num('pitchVariation', 0, 'Each play is higher or lower by up to this share.').range(0, 1);
  sound.bool('loop', false, 'Played again when it ends (music, the ball rolling).');
  sound.sample = '{ "id": "clack", "file": "clack.wav", "volume": 0.8, "volumeVariation": 0.15, "pitchVariation": 0.08 }';

  const music = new Schema('music', 'The music of each state of the game (names of `sounds`, usually with `loop`).');
  music.ref('attract', 'sounds', 'While the table waits for a player.');
  music.ref('play', 'sounds', 'During a ball.');
  music.ref('multiball', 'sounds', 'During multiball.');
  music.ref('gameOver', 'sounds', 'After the last ball.');
  music.sample = '"music": { "attract": "drift", "play": "shift", "multiball": "surge" }';

  // ---------------------------------------------------------------- the table and its physics
  const playfield = new Schema('playfield', 'The board the ball rolls on: a rectangle from (0, 0) at the top left to (width, length) at the bottom right, where the drain is. A ball that passes the bottom edge is lost.');
  playfield.num('width', 51, 'Left to right.').range(20, 200);
  playfield.num('length', 107, 'Top to bottom.').range(40, 400);
  playfield.num('slope', 6.5, 'The tilt of the table in degrees: how hard the ball is pulled towards the player.').range(0, 45);
  playfield.num('glass', 12, 'The height of the glass above the playfield: a ball that jumps cannot go higher.').range(3, 100);
  body(playfield, 'Usually smooth wood.', 'The colour or the image of the board.');

  const ball = new Schema('ball', 'The ball.');
  ball.num('radius', 1.35, 'A real pinball is 27 mm across.').range(0.5, 5);
  ball.num('mass', 80, 'In grams. Only its ratio to the strength of kicks and flippers matters.').range(1, 1000);
  ball.num('friction', 0.25, 'Its grip on what it touches: more grip turns sliding into spin sooner.').range(0, 2);
  ball.num('restitution', 0.3, 'Its bounce when two balls meet.').range(0, 1.2);
  ball.num('drag', 0.05, 'How fast it loses speed by itself, per second.').range(0, 5);
  ball.num('spin', 0.05, 'How fast it loses spin by itself, per second.').range(0, 5);
  ball.ref('look', 'looks', 'Usually chrome.');

  const physics = new Schema('physics', 'How the table plays. The numbers are real ones at first; a table tuned for arcade play raises gravity and kicks.');
  physics.int('rate', 960, 'Steps of the simulation per second. Fast flippers and a small ball need many: under 480 a slow ball can end behind a flipper.').range(240, 4000);
  physics.num('gravity', 981, 'cm/s² straight down. The slope of the playfield sends its share down the table.').range(100, 5000);
  physics.num('maxSpeed', 700, 'The fastest a ball may go; kicks that would exceed it are capped.').range(100, 4000);
  physics.num('nudge', 35, 'The speed a bump of the table gives every ball.').range(0, 400);
  physics.obj('ball', ball, 'The ball.');

  // ---------------------------------------------------------------- walls
  const wall = new Schema('wall', 'A wall, a guide or a lane divider: a path seen from above, raised to a height. Posts and rubbers are short walls with another surface.');
  element(wall, 'wall');
  wall.rows('points', 2, 3, 2, 'The path: [x, y] for each point, or [x, y, bulge] when the stretch to the next point is an arc (bulge = sagitta / half chord: 0.4142 is a quarter circle, 1 a half circle; positive curves to the left of the direction of travel as seen in the top view).');
  wall.bool('closed', false, 'The last point joins the first.');
  wall.num('z', 0, 'The height of its foot above the playfield (an upper level stands on its own floor).').range(0, 100);
  wall.num('height', 2.6, 'How tall it is. A ball that jumps higher passes over.').range(0.2, 100);
  wall.num('thickness', 0.3, 'How thick it is.').range(0.1, 10);
  body(wall, 'Metal by default.', 'Metal by default.');
  wall.obj('sounds', soundsOf('wall', ['hit'], ['When the ball hits it.']), 'Its sounds.');

  const gate = new Schema('gate', 'A one-way gate across a lane: the ball passes when it comes from the left of the direction a to b (as seen in the top view), and is stopped from the other side.');
  element(gate, 'gate');
  gate.tuple('a', [0, 0], 'One end.').must();
  gate.tuple('b', [0, 0], 'The other end.').must();
  gate.num('z', 0, 'The height of its foot.').range(0, 100);
  gate.num('height', 2.6, 'How tall it is.').range(0.2, 100);
  body(gate, '', 'A wire by default.');
  gate.obj('sounds', soundsOf('gate', ['pass'], ['When a ball goes through.']), 'Its sounds.');

  // ---------------------------------------------------------------- flippers, plunger
  const flipper = new Schema('flipper', 'A flipper: a tapered bat that turns around its pivot while its button is held.');
  element(flipper, 'flipper');
  flipper.tuple('pivot', [0, 0], 'Where it turns.').must();
  flipper.num('z', 0, 'The height of its foot (a flipper of an upper level stands on that level).').range(0, 100);
  flipper.num('length', 7.6, 'From the pivot to the tip.').range(2, 30);
  flipper.num('baseRadius', 0.9, 'Its radius at the pivot.').range(0.2, 5);
  flipper.num('tipRadius', 0.45, 'Its radius at the tip.').range(0.1, 5);
  flipper.num('height', 1.6, 'How tall it is.').range(0.5, 10);
  flipper.num('rest', 25, 'The angle of the bat at rest: 0 points right, 90 down the table. A left flipper rests near 25, a right one near 155.').range(-360, 360);
  flipper.num('stroke', -50, 'How far it swings when the button is pressed, in degrees: negative turns up for a left flipper, positive for a right one.').range(-180, 180);
  flipper.num('speed', 2300, 'How fast it swings, degrees per second. This is the strength of the flipper: the ball leaves with the speed of the spot that hits it.').range(100, 10000);
  flipper.num('returnSpeed', 1100, 'How fast it falls back when the button is released.').range(100, 10000);
  flipper.choice('button', ['left', 'right'], 'The flipper button that drives it.');
  body(flipper, 'Rubber by default.', '');
  flipper.obj('sounds', soundsOf('flipper', ['up', 'down'], ['When it swings.', 'When it falls back.']), 'Its sounds.');

  const plunger = new Schema('plunger', 'The plunger: it is pulled back while its button is held, and released it strikes the ball that waits in front of it.');
  plunger.tuple('at', [0, 0], 'The centre of its tip at rest. A new ball is put just in front of it.').must();
  plunger.num('z', 0, 'The height of its foot.').range(0, 100);
  plunger.num('angle', -90, 'The direction it shoots: -90 is up the table.').range(-360, 360);
  plunger.num('travel', 5, 'How far it can be pulled back.').range(0.5, 30);
  plunger.num('pullTime', 0.9, 'Seconds to pull it all the way.').range(0.05, 10);
  plunger.num('speed', 450, 'The speed of the tip when released from a full pull; a shorter pull gives less.').range(50, 4000);
  plunger.num('width', 2.2, 'The width of its tip.').range(0.5, 20);
  plunger.num('height', 2.2, 'The height of its tip.').range(0.5, 20);
  body(plunger, '', '');
  plunger.obj('sounds', soundsOf('plunger', ['pull', 'release'], ['While it is pulled.', 'When it is released.']), 'Its sounds.');

  // ---------------------------------------------------------------- things the ball hits
  const bumper = new Schema('bumper', 'A pop bumper: a round post that kicks the ball away when it is touched.');
  element(bumper, 'bumper');
  bumper.tuple('at', [0, 0], 'Its centre.').must();
  bumper.num('z', 0, 'The height of its foot.').range(0, 100);
  bumper.num('radius', 2.6, 'The radius of its body.').range(0.5, 20);
  bumper.num('height', 3.2, 'How tall it is.').range(0.5, 50);
  bumper.num('kick', 140, 'The speed it adds to the ball, away from its centre.').range(0, 2000);
  bumper.num('threshold', 15, 'The ball must arrive at least this fast to set it off.').range(0, 1000);
  body(bumper, '', 'The body; its `glow` shows when it fires.');
  bumper.ref('cap', 'looks', 'The look of its cap.');
  bumper.obj('sounds', soundsOf('bumper', ['hit'], ['When it fires.']), 'Its sounds.');

  const slingshot = new Schema('slingshot', 'A slingshot: a rubber band stretched from a to b that kicks the ball away, to the left of the direction a to b (as seen in the top view).');
  element(slingshot, 'slingshot');
  slingshot.tuple('a', [0, 0], 'One end of the band.').must();
  slingshot.tuple('b', [0, 0], 'The other end.').must();
  slingshot.num('z', 0, 'The height of its foot.').range(0, 100);
  slingshot.num('height', 2.2, 'How tall the band is.').range(0.2, 50);
  slingshot.num('thickness', 0.5, 'How thick the band is.').range(0.1, 10);
  slingshot.num('kick', 120, 'The speed it adds to the ball.').range(0, 2000);
  slingshot.num('threshold', 25, 'The ball must arrive at least this fast to set it off.').range(0, 1000);
  body(slingshot, 'Rubber by default.', 'Its `glow` shows when it fires.');
  slingshot.obj('sounds', soundsOf('slingshot', ['hit'], ['When it fires.']), 'Its sounds.');

  const kicker = new Schema('kicker', 'A hole that catches the ball, holds it, then throws it out: a saucer (same place), a subway (it comes out elsewhere), or a launcher that throws it in the air.');
  element(kicker, 'kicker');
  kicker.tuple('at', [0, 0], 'Its centre.').must();
  kicker.num('z', 0, 'The height of the level it is in.').range(0, 100);
  kicker.num('radius', 1.7, 'The radius of the hole.').range(0.5, 20);
  kicker.num('captureSpeed', 220, 'A ball faster than this rolls over the hole.').range(10, 4000);
  kicker.num('hold', 1.2, 'Seconds it keeps the ball (rules may keep it longer: a lock).').range(0, 60);
  kicker.tuple('exit', [0, 0, 0], 'Where the ball comes out, counted from the hole: [0, 0, 0] is the hole itself, [0, 0, 6] the same place on a level 6 cm higher.');
  kicker.num('speed', 180, 'The speed it throws the ball at.').range(0, 4000);
  kicker.num('angle', 90, 'The direction it throws the ball in, in the top view.').range(-360, 360);
  kicker.num('elevation', 0, 'How steeply upwards it throws the ball, in degrees: 0 rolls it out, 45 throws it in an arc.').range(0, 90);
  kicker.ref('look', 'looks', 'The look of its rim.');
  kicker.ref('light', 'lights', 'A light that the kicker turns on while it holds a ball.');
  kicker.obj('sounds', soundsOf('kicker', ['capture', 'eject'], ['When it catches a ball.', 'When it throws it out.']), 'Its sounds.');

  const target = new Schema('target', 'A target: a small plate the ball hits. A standup stays; a drop target goes down when hit and stays down until a rule raises it.');
  element(target, 'target');
  target.choice('kind', ['standup', 'drop'], 'standup or drop.');
  target.tuple('at', [0, 0], 'The centre of its face.').must();
  target.num('z', 0, 'The height of its foot.').range(0, 100);
  target.num('angle', 90, 'The direction its face looks at: 90 faces down the table.').range(-360, 360);
  target.num('width', 2.4, 'How wide it is.').range(0.5, 20);
  target.num('height', 2.4, 'How tall it is.').range(0.5, 20);
  target.num('thickness', 0.5, 'How thick it is.').range(0.1, 5);
  body(target, 'Plastic by default.', 'Its `glow` shows when it is lit.');
  target.ref('light', 'lights', 'A light on the playfield that goes with it (rules light it by this name or by the target\'s).');
  target.obj('sounds', soundsOf('target', ['hit', 'reset'], ['When the ball hits it.', 'When it is raised again.']), 'Its sounds.');

  const rollover = new Schema('rollover', 'A switch in the playfield that a ball rolling over it closes: the line from a to b across a lane.');
  element(rollover, 'rollover');
  rollover.tuple('a', [0, 0], 'One end of the line.').must();
  rollover.tuple('b', [0, 0], 'The other end.').must();
  rollover.num('z', 0, 'The height of the level it is in.').range(0, 100);
  rollover.ref('light', 'lights', 'A light that goes with it.');
  rollover.obj('sounds', soundsOf('rollover', ['roll'], ['When a ball rolls over it.']), 'Its sounds.');

  const spinner = new Schema('spinner', 'A spinner: a plate hung across a lane that a ball passing under sets spinning; every half turn is an event.');
  element(spinner, 'spinner');
  spinner.tuple('a', [0, 0], 'One end of its axle.').must();
  spinner.tuple('b', [0, 0], 'The other end.').must();
  spinner.num('z', 0, 'The height of the level it is in.').range(0, 100);
  spinner.num('height', 3, 'The height of the plate.').range(1, 20);
  spinner.num('turns', 0.02, 'Half turns per second it gains for each cm/s of the ball that passes.').range(0, 1);
  spinner.num('damping', 1.1, 'How fast it slows, per second.').range(0.05, 20);
  spinner.ref('look', 'looks', 'The look of its plate.');
  spinner.obj('sounds', soundsOf('spinner', ['spin'], ['At every half turn.']), 'Its sounds.');

  // ---------------------------------------------------------------- levels above the playfield
  const ramp = new Schema('ramp', 'A ramp, a rail or a habitrail: a track that follows a path seen from above while its height follows a profile. The ball climbs it, rides it above the playfield and leaves it where it ends, or flies off its lip.');
  element(ramp, 'ramp');
  ramp.rows('points', 2, 3, 2, 'The centre line seen from above, as for a wall (arcs by bulge).');
  ramp.rows('profile', 2, 2, 2, 'The height along the path: [fraction of the length, height] from [0, ...] to [1, ...], straight between the rows. [[0, 0], [0.3, 5], [1, 5]] climbs to 5 cm over the first third, then stays level.');
  ramp.num('width', 3.6, 'The width of the track between its side walls.').range(1, 50);
  ramp.num('wall', 1.6, 'The height of the side walls above the track; 0 for none (a jump ramp).').range(0, 20);
  ramp.num('thickness', 0.2, 'How thick the track is.').range(0.05, 5);
  ramp.choice('style', ['solid', 'wire'], 'solid: a plastic or metal ramp; wire: a habitrail, drawn as wires.');
  body(ramp, 'Plastic by default.', '');
  ramp.obj('sounds', soundsOf('ramp', ['enter', 'exit'], ['When a ball enters at its first point.', 'When a ball leaves at its last point.']), 'Its sounds.');

  const floor = new Schema('floor', 'A level above the playfield: an upper playfield or a platform, whose outline is a closed path and whose top is at height z. Walls, flippers, targets and the rest stand on it by their own z.');
  element(floor, 'floor');
  floor.rows('points', 2, 3, 3, 'The outline seen from above (closed by itself), as for a wall.');
  floor.num('z', 5, 'The height of its top.').range(0.5, 100);
  floor.num('thickness', 0.4, 'How thick it is.').range(0.1, 10);
  body(floor, '', '');
  floor.sample = '{ "id": "deck", "points": [[4, 8], [18, 8], [18, 24], [4, 24]], "z": 5.5, "surface": "wood", "look": "board" }';

  // ---------------------------------------------------------------- lights, models
  const light = new Schema('light', 'A lamp under the playfield or on an element, that the rules turn on, off or blink.');
  light.id('lights', 'Its name.');
  light.text('group', '', 'A name shared by several lights ("lanes", "mission").');
  light.tuple('at', [0, 0], 'Its centre.').must();
  light.num('z', 0, 'The height of the level it is in.').range(0, 100);
  light.choice('shape', ['round', 'arrow', 'bar'], 'The shape of the insert.');
  light.num('size', 1.1, 'Its radius, or half its length.').range(0.2, 20);
  light.num('angle', -90, 'Where an arrow points, or how a bar lies.').range(-360, 360);
  light.color('color', '#ffcc33', 'Its colour when on; off, it shows a dark shade of it.');

  const model = new Schema('model', 'A modelled or decorative piece: a mesh file, or a simple solid.');
  element(model, 'model');
  model.asset('mesh', 'An OBJ file of the table folder. Empty: the solid named by `shape`.');
  model.choice('shape', ['box', 'cylinder', 'sphere', 'cone'], 'The solid, 1 cm in size before `scale`.');
  model.tuple('at', [0, 0, 0], 'Where its origin is: [x, y, z].').must();
  model.tuple('rotation', [0, 0, 0], 'Its turn in degrees around x, y (down the table) and z (up).');
  model.tuple('scale', [1, 1, 1], 'Its size along x, y and z.');
  model.choice('collide', ['none', 'box', 'hull'], 'none: the ball goes through (decoration); box: it meets its bounding box; hull: its convex hull.');
  body(model, '', '');

  // ---------------------------------------------------------------- rules
  const condition = new Schema('condition', 'One thing that must hold for a rule to act.');
  condition.choice('test', ['counter', 'lights', 'targets', 'mode', 'rank', 'mission', 'balls'], 'counter: a counter against `value`; lights: every light of a name or group is on or off; targets: every drop target of a name or group is down or up; mode: the game is in normal or multiball; rank: the rank number against `value`; mission: the current mission is `target`; balls: the balls in play against `value`.').must();
  condition.text('target', '', 'What is tested: a counter, a light or group ("self": the light of the element the event came from), a target or group, a mission, or a mode ("normal", "multiball").');
  condition.choice('is', ['atLeast', 'below', 'equal', 'on', 'off', 'down', 'up'], 'The comparison.');
  condition.num('value', 0, 'The number compared with.');

  const action = new Schema('action', 'One thing a rule does.');
  action.choice('do', ['score', 'bonus', 'multiplier', 'light', 'count', 'reset', 'say', 'sound', 'award', 'rotate'],
    'score: add `value` points (times the playfield multiplier during multiball); bonus: add `value` to the end-of-ball bonus; multiplier: raise the bonus multiplier by `value`; light: set the lights of `target` to `mode`; count: add `value` to the counter `target`, or set it with mode "set"; reset: raise the drop targets of `target`; say: show the text `target` on the panel; sound: play the sound `target`; award: give what `mode` names; rotate: move the lit lights of the group `target` by `value` places (lane change).').must();
  action.text('target', '', 'What it acts on. For light, "self" is the light of the element the event came from.');
  action.num('value', 0, 'How much.');
  action.choice('mode', ['', 'on', 'off', 'blink', 'flash', 'toggle', 'set', 'extraBall', 'ballSave', 'lock', 'multiball', 'mission'],
    'For light: on, off, blink, flash (on for `seconds`) or toggle. For count: set. For award: extraBall, ballSave (for `seconds`), lock (keep the ball in the kicker that caught it), multiball (start it), mission (count one step of the current mission, whatever it listens to).');
  action.num('seconds', 0, 'How long, for a flash or a ball save.').range(0, 600);

  const rule = new Schema('rule', 'When something happens, and some things hold, do some things. Rules are read in order; all that match act.');
  rule.ref('on', ANY, 'The element, or the group of elements, that the event comes from; "game" for the events of the game itself.').must();
  rule.choice('event', EVENTS, 'hit: a bumper, slingshot, target or wall was hit; down: a drop target went down; roll: a rollover; spin: half a turn of a spinner; capture, eject: a kicker; enter, exit: a ramp; pass: a gate; flip: a flipper; launch: the plunger. From "game": start, ballStart, drain, ballSaved, tilt, missionDone, rankUp, multiballStart, multiballEnd, jackpot, extraBall, gameOver.').must();
  rule.list('if', condition, 'Every one must hold.');
  rule.list('do', action, 'What happens.');

  const step = new Schema('step', 'One step of a mission: an event to get a number of times.');
  step.text('text', '', 'What the panel asks for ("Shoot the ramp").').must();
  step.ref('on', ANY, 'Where the event comes from.').must();
  step.choice('event', EVENTS, 'The event.').must();
  step.int('count', 1, 'How many times.').range(1, 1000);
  step.ref('light', 'lights|light groups', 'A light, or a group, that blinks while this step is the one to do.');

  const mission = new Schema('mission', 'A mission: steps to do in order. One mission runs at a time, in the order of the list; finishing it pays its award times the rank and promotes the player.');
  mission.id('missions', 'Its name for rules.');
  mission.text('name', '', 'Its name on the panel.').must();
  mission.num('award', 25000, 'Points for finishing it, multiplied by the rank number.').range(0, 1e9);
  mission.list('steps', step, 'Its steps.');

  const multiball = new Schema('multiball', 'Multiball: balls locked in a kicker start it; while it lasts a shot scores the jackpot, which grows.');
  multiball.int('balls', 3, 'Balls in play when it starts.').range(2, 8);
  multiball.int('locks', 3, 'Locks (award "lock") needed to start it; 0: only a rule starts it.').range(0, 20);
  multiball.num('ballSave', 12, 'Seconds a drained ball comes back after it starts.').range(0, 120);
  multiball.num('scoreMultiplier', 2, 'Scores are multiplied by this while it lasts.').range(1, 100);
  multiball.ref('jackpotOn', ANY, 'Where the jackpot shot is.');
  multiball.choice('jackpotEvent', EVENTS, 'The event of the jackpot shot.');
  multiball.num('jackpot', 20000, 'The first jackpot.').range(0, 1e9);
  multiball.num('jackpotStep', 5000, 'What each jackpot adds to the next.').range(0, 1e9);

  const tilt = new Schema('tilt', 'Bumping the table: every bump fills a meter that empties with time; too full, the table tilts.');
  tilt.int('warnings', 2, 'Bumps in a row that only warn; the next one tilts.').range(0, 20);
  tilt.num('recovery', 2.5, 'Seconds for one bump to be forgotten.').range(0.1, 60);
  tilt.choice('penalty', ['bonus', 'ball', 'none'], 'bonus: the flippers die until the ball drains and its bonus is lost; ball: the same, and no ball save; none: only a warning.');
  tilt.sample = '"tilt": { "warnings": 1, "recovery": 4, "penalty": "ball" }';

  const highScore = new Schema('high score', 'A line of the high score table as the table ships; the scores players make are kept apart, by the game.');
  highScore.text('name', '', 'Three letters.').must();
  highScore.num('score', 0, 'The score.').range(0, 1e12).must();

  const rules = new Schema('rules', 'How the table is played and scored. Everything here is data: the game has no rule of its own.');
  rules.int('balls', 3, 'Balls per game.').range(1, 10);
  rules.num('ballSave', 8, 'Seconds after a launch during which a drained ball comes back.').range(0, 120);
  rules.int('extraBalls', 3, 'Extra balls one game can hold.').range(0, 10);
  rules.int('multiplierMax', 5, 'The highest bonus multiplier.').range(1, 100);
  rules.obj('tilt', tilt, 'Bumps and tilt.');
  rules.texts('ranks', 'The ranks, from the first: finishing a mission promotes to the next.');
  rules.texts('counters', 'The names of the counters the rules use (a rule can only count what is declared here).');
  rules.list('missions', mission, 'The missions.');
  rules.obj('multiball', multiball, 'Multiball.');
  rules.list('when', rule, 'The rules.');
  rules.list('highScores', highScore, 'The high scores the table ships with.');

  // ---------------------------------------------------------------- screen
  const camera = new Schema('camera', 'The fixed eye that looks at the table, in table coordinates.');
  camera.tuple('position', [25.5, 200, 150], 'Where it is: [x, y, z].');
  camera.tuple('target', [25.5, 55, 0], 'What it looks at.');
  camera.num('fov', 28, 'The vertical field of view, in degrees.').range(5, 120);

  const item = new Schema('panel item', 'One thing the panel shows, in a box of the window.');
  item.choice('show', ['title', 'score', 'ball', 'rank', 'mission', 'step', 'message', 'bonus', 'highScores', 'hint'], 'title: the name of the table; score; ball: the ball number and the extra balls; rank; mission: the name of the mission; step: what to do next; message: what the rules say; bonus: the bonus and its multiplier; highScores; hint: the keys.').must();
  item.tuple('box', [0, 0, 100, 30], 'Where: [x, y, width, height] in the window.').must();
  item.num('size', 20, 'The height of the text.').range(6, 400);
  item.color('color', '#e8f0ff', 'The colour of the text.');
  item.choice('align', ['left', 'center', 'right'], 'How the text sits in its box.');
  item.text('label', '', 'A small caption above it.');

  const panel = new Schema('panel', 'The score panel.');
  panel.tuple('box', [0, 0, 0, 0], 'Its background: [x, y, width, height] in the window; all zeros for none (items drawn over the table).');
  panel.color('color', '#0a0e1c', 'The colour of its background.');
  panel.list('items', item, 'What it shows.');

  const layout = new Schema('layout', 'One way to put the table and the panel in a window.');
  layout.tuple('window', [1280, 800], 'The size the layout is drawn for; another window is letterboxed.');
  layout.tuple('view', [0, 0, 640, 800], 'Where the table is drawn: [x, y, width, height] in the window.');
  layout.obj('camera', camera, 'The eye.');
  layout.obj('panel', panel, 'The panel.');

  const layouts = new Schema('layouts', 'The two layouts. The game takes portrait when its window is taller than wide, landscape otherwise, unless a launch option forces one.');
  layouts.obj('landscape', layout, 'The table upright at the left, the panel at the right.');
  layouts.obj('portrait', layout, 'The whole table on a vertical screen, the score in the backglass area above it.');

  const lamp = new Schema('lamp', 'A light that shines on the whole table from far away.');
  lamp.tuple('direction', [0.3, 0.5, -1], 'The way the light travels: [x, y, z] (z negative: downwards).');
  lamp.color('color', '#ffffff', 'Its colour.');

  const lighting = new Schema('lighting', 'The light of the scene.');
  lighting.color('background', '#05060c', 'What is seen around the table.');
  lighting.color('ambient', '#5a5f70', 'The light that reaches everything.');
  lighting.list('lamps', lamp, 'Up to 4 lamps.');

  // ---------------------------------------------------------------- the file
  const table = new Schema('table', 'A table file.');
  table.choice('format', [FORMAT], 'What this file is.').must();
  table.int('version', VERSION, 'The version of the format the file is written in.').must();
  table.text('name', '', 'The name of the table.').must();
  table.text('author', '', 'Who made it.');
  table.text('description', '', 'A line about it.');
  table.obj('playfield', playfield, 'The board.');
  table.obj('physics', physics, 'How it plays.');
  table.list('surfaces', surface, 'The surfaces elements are made of.');
  table.list('looks', look, 'The looks elements are given.');
  table.list('sounds', sound, 'The sounds.');
  table.obj('music', music, 'The music.');
  table.list('walls', wall, 'Walls, guides, posts.');
  table.list('gates', gate, 'One-way gates.');
  table.list('flippers', flipper, 'Flippers.');
  table.obj('plunger', plunger, 'The plunger.').must();
  table.list('bumpers', bumper, 'Pop bumpers.');
  table.list('slingshots', slingshot, 'Slingshots.');
  table.list('kickers', kicker, 'Kickers, saucers, holes.');
  table.list('targets', target, 'Standup and drop targets.');
  table.list('rollovers', rollover, 'Rollover switches.');
  table.list('spinners', spinner, 'Spinners.');
  table.list('ramps', ramp, 'Ramps, rails, habitrails.');
  table.list('floors', floor, 'Upper playfields.');
  table.list('lights', light, 'Lights.');
  table.list('models', model, 'Modelled and decorative pieces.');
  table.obj('rules', rules, 'The rules.');
  table.obj('lighting', lighting, 'The light of the scene.');
  table.obj('layouts', layouts, 'The screen layouts.');
  return table;
}
