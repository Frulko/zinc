// Box library: every built-in box is declared here as data — ports, parameters, the Zinc modules it needs and a
// code template. codegen.ts expands the templates into the generated program; the UI lists and draws them.
//
// Template tokens (replaced per box instance by codegen.ts):
//   {id}          the instance id (b3): prefix your state variables with it, e.g. `let {id}_count = 0;`
//   {p:name}      the parameter as a literal: numbers as is, strings / assets quoted, bools true / false
//   {raw:name}    the parameter text unquoted (class names, operators, console levels)
//   {emit:port}   the function that fires an output port: `{emit:onDone}()`, `{emit:value}(42)`
// Input handlers receive the value of a value input as `v` (number or string, as declared).

/** A port: `signal` ports carry an event, `value` ports an event with a number or a string. */
export class PortDef {
  name: string; kind: string; type: string;
  constructor(name: string, kind: string, type: string) { this.name = name; this.kind = kind; this.type = type; }
  get isSignal(): boolean { return this.kind === 'signal'; }
}
/** A parameter edited in the inspector. type: number | string | bool | asset | choice. */
export class ParamDef {
  name: string; type: string; def: string; hint: string;
  min: number = -1e12; max: number = 1e12;
  choices: string[] = [];
  constructor(name: string, type: string, def: string, hint: string) { this.name = name; this.type = type; this.def = def; this.hint = hint; }
}
export class Handler {
  port: string; body: string;
  constructor(port: string, body: string) { this.port = port; this.body = body; }
}
export class BoxDef {
  type: string; title: string; category: string; description: string;
  inputs: PortDef[] = []; outputs: PortDef[] = []; params: ParamDef[] = [];
  /** Zinc modules imported by the generated code (`zinc:net` becomes `import * as net from 'zinc:net'`). */
  modules: string[] = [];
  /** Top-level code once per instance (state variables). */
  setup: string = '';
  /** Code run when the program starts (after the screen is mounted). */
  start: string = '';
  handlers: Handler[] = [];
  /** Draws on the screen: the generated program mounts a stage when one of these is used. */
  screen: boolean = false;
  constructor(type: string, title: string, category: string, description: string) {
    this.type = type; this.title = title; this.category = category; this.description = description;
  }
  input(name: string): PortDef | null { for (const p of this.inputs) if (p.name === name) return p; return null; }
  output(name: string): PortDef | null { for (const p of this.outputs) if (p.name === name) return p; return null; }
  param(name: string): ParamDef | null { for (const p of this.params) if (p.name === name) return p; return null; }
  handler(port: string): string { for (const h of this.handlers) if (h.port === port) return h.body; return ''; }
}

/** 'onStart onStop value:n text:s' -> ports (:n number value, :s string value, bare name: signal). */
function ports(spec: string): PortDef[] {
  const out: PortDef[] = [];
  for (const w of spec.split(' ')) {
    if (w === '') continue;
    const c = w.indexOf(':');
    if (c < 0) out.push(new PortDef(w, 'signal', ''));
    else out.push(new PortDef(w.slice(0, c), 'value', w.slice(c + 1) === 'n' ? 'number' : 'string'));
  }
  return out;
}
function num(name: string, def: string, hint: string, min: number, max: number): ParamDef {
  const p = new ParamDef(name, 'number', def, hint); p.min = min; p.max = max; return p;
}
function str(name: string, def: string, hint: string): ParamDef { return new ParamDef(name, 'string', def, hint); }
function bool(name: string, def: string, hint: string): ParamDef { return new ParamDef(name, 'bool', def, hint); }
function asset(name: string, def: string, hint: string): ParamDef { return new ParamDef(name, 'asset', def, hint); }
function choice(name: string, def: string, hint: string, choices: string[]): ParamDef {
  const p = new ParamDef(name, 'choice', def, hint); p.choices = choices; return p;
}

export const CATEGORIES: string[] = ['Flow', 'Math & Logic', 'Data', 'Screen', 'Media', 'Network', 'IO', 'Debug'];
/** Category accent colours (cards, library dots). */
export const CATEGORY_COLORS: i32[] = [0x6366f1, 0xf59e0b, 0x10b981, 0x0ea5e9, 0xec4899, 0x8b5cf6, 0xef4444, 0x64748b];
export function categoryColor(cat: string): i32 { const i = CATEGORIES.indexOf(cat); return i >= 0 ? CATEGORY_COLORS[i] : 0x64748b; }

export const BOXES: BoxDef[] = [];
function box(type: string, title: string, category: string, description: string, ins: string, outs: string): BoxDef {
  const b = new BoxDef(type, title, category, description);
  b.inputs = ports(ins); b.outputs = ports(outs);
  BOXES.push(b);
  return b;
}
export function boxDef(type: string): BoxDef | null { for (const b of BOXES) if (b.type === type) return b; return null; }

// ---------------------------------------------------------------- Flow
let b = box('on_start', 'On Start', 'Flow', 'Fires once when the program starts (like the diagram start bar).', '', 'onStart');
b.start = '{emit:onStart}();';

b = box('delay', 'Delay', 'Flow', 'Waits, then fires onDone. onStop cancels a pending wait.', 'onStart onStop', 'onDone');
b.params = [num('seconds', '1', 'Wait time in seconds', 0, 86400)];
b.setup = 'let {id}_timer = -1;';
b.handlers = [
  new Handler('onStart', 'if ({id}_timer >= 0) clearTimeout({id}_timer);\n{id}_timer = setTimeout(() => { {id}_timer = -1; {emit:onDone}(); }, {p:seconds} * 1000);'),
  new Handler('onStop', 'if ({id}_timer >= 0) clearTimeout({id}_timer);\n{id}_timer = -1;'),
];

b = box('loop', 'Loop', 'Flow', 'Fires onLoop `count` times, `interval` seconds apart, then onDone.', 'onStart onStop', 'onLoop index:n onDone');
b.params = [num('count', '3', 'Iterations', 1, 1000000), num('interval', '0.5', 'Seconds between iterations', 0, 3600)];
b.setup = 'let {id}_i = 0;\nlet {id}_timer = -1;\nfunction {id}_step(): void {\n  if ({id}_i >= {p:count}) { {id}_timer = -1; {emit:onDone}(); return; }\n  {emit:index}({id}_i);\n  {id}_i++;\n  {emit:onLoop}();\n  {id}_timer = setTimeout(() => { {id}_step(); }, {p:interval} * 1000);\n}';
b.handlers = [
  new Handler('onStart', 'if ({id}_timer >= 0) clearTimeout({id}_timer);\n{id}_i = 0;\n{id}_step();'),
  new Handler('onStop', 'if ({id}_timer >= 0) clearTimeout({id}_timer);\n{id}_timer = -1;'),
];

b = box('if', 'If', 'Flow', 'Compares a number with a threshold and fires onTrue or onFalse.', 'value:n', 'onTrue onFalse');
b.params = [choice('op', '>', 'Comparison', ['>', '>=', '<', '<=', '===', '!==']), num('threshold', '0', 'Compared with', -1e12, 1e12)];
b.handlers = [new Handler('value', 'if (v {raw:op} {p:threshold}) {emit:onTrue}();\nelse {emit:onFalse}();')];

b = box('switch', 'Switch', 'Flow', 'Routes a text value to the first matching case.', 'value:s', 'case1 case2 case3 onDefault');
b.params = [str('case1', 'red', 'Fires case1 when equal'), str('case2', 'green', 'Fires case2 when equal'), str('case3', 'blue', 'Fires case3 when equal')];
b.handlers = [new Handler('value', 'if (v === {p:case1}) {emit:case1}();\nelse if (v === {p:case2}) {emit:case2}();\nelse if (v === {p:case3}) {emit:case3}();\nelse {emit:onDefault}();')];

b = box('wait_for', 'Wait For Signals', 'Flow', 'Fires onDone once both a and b have fired (in any order), then re-arms.', 'a b', 'onDone');
b.setup = 'let {id}_a = false;\nlet {id}_b = false;\nfunction {id}_check(): void {\n  if (!{id}_a || !{id}_b) return;\n  {id}_a = false; {id}_b = false;\n  {emit:onDone}();\n}';
b.handlers = [new Handler('a', '{id}_a = true;\n{id}_check();'), new Handler('b', '{id}_b = true;\n{id}_check();')];

b = box('stop', 'Stop', 'Flow', 'Ends the behavior: fires the diagram onStopped bar.', 'onStart', '');
b.handlers = [new Handler('onStart', 'diagram_onStopped();')];

// ---------------------------------------------------------------- Math & Logic
b = box('math', 'Math', 'Math & Logic', 'Computes a op b whenever a or b changes.', 'a:n b:n', 'result:n');
b.params = [choice('op', '+', 'Operator', ['+', '-', '*', '/', '%']), num('b', '1', 'Initial value of b', -1e12, 1e12)];
b.setup = 'let {id}_a = 0;\nlet {id}_b = {p:b};';
b.handlers = [
  new Handler('a', '{id}_a = v;\n{emit:result}({id}_a {raw:op} {id}_b);'),
  new Handler('b', '{id}_b = v;\n{emit:result}({id}_a {raw:op} {id}_b);'),
];

b = box('random', 'Random', 'Math & Logic', 'Emits a random number in [min, max).', 'onStart', 'value:n');
b.params = [num('min', '0', 'Lower bound', -1e12, 1e12), num('max', '100', 'Upper bound', -1e12, 1e12)];
b.handlers = [new Handler('onStart', '{emit:value}({p:min} + Math.random() * ({p:max} - {p:min}));')];

// ---------------------------------------------------------------- Data
b = box('value', 'Value', 'Data', 'Emits a constant number.', 'onStart', 'value:n');
b.params = [num('value', '42', 'The number', -1e12, 1e12)];
b.handlers = [new Handler('onStart', '{emit:value}({p:value});')];

b = box('text', 'Text', 'Data', 'Emits a constant text.', 'onStart', 'text:s');
b.params = [str('text', 'Hello', 'The text')];
b.handlers = [new Handler('onStart', '{emit:text}({p:text});')];

b = box('counter', 'Counter', 'Data', 'Counts increments; reset sets it back to 0.', 'increment reset', 'count:n');
b.setup = 'let {id}_n = 0;';
b.handlers = [new Handler('increment', '{id}_n++;\n{emit:count}({id}_n);'), new Handler('reset', '{id}_n = 0;\n{emit:count}({id}_n);')];

b = box('timer', 'Timer', 'Data', 'Ticks every `interval` seconds while running; elapsed is in seconds.', 'onStart onStop', 'onTick elapsed:n');
b.params = [num('interval', '1', 'Seconds between ticks', 0.01, 86400)];
b.setup = 'let {id}_timer = -1;\nlet {id}_ticks = 0;';
b.handlers = [
  new Handler('onStart', 'if ({id}_timer >= 0) return;\n{id}_ticks = 0;\n{id}_timer = setInterval(() => { {id}_ticks++; {emit:onTick}(); {emit:elapsed}({id}_ticks * {p:interval}); }, {p:interval} * 1000);'),
  new Handler('onStop', 'if ({id}_timer >= 0) clearInterval({id}_timer);\n{id}_timer = -1;'),
];

// ---------------------------------------------------------------- Screen
b = box('show_text', 'Show Text', 'Screen', 'Shows a line of text on the screen; the text input replaces it.', 'onStart text:s', 'onDone');
b.params = [str('text', 'Hello!', 'Text shown'), choice('size', '4xl', 'Font size', ['base', 'xl', '2xl', '4xl', '6xl']),
  choice('color', 'zinc-900', 'Text colour', ['zinc-900', 'zinc-500', 'sky-600', 'rose-600', 'emerald-600'])];
b.modules = ['zinc:ui'];
b.screen = true;
b.setup = 'let {id}_node = -1;';
b.handlers = [
  new Handler('onStart', 'if ({id}_node < 0) {\n  {id}_node = ui.createText({p:text});\n  ui.setClass({id}_node, \'text-{raw:size} font-bold text-{raw:color}\');\n  show({id}_node);\n}\n{emit:onDone}();'),
  new Handler('text', 'if ({id}_node >= 0) ui.setText({id}_node, v);'),
];

b = box('show_image', 'Show Image', 'Screen', 'Shows a PNG or SVG from the project assets.', 'onStart', 'onDone');
b.params = [asset('image', 'logo.svg', 'Image asset (PNG / SVG)')];
b.modules = ['zinc:ui'];
b.screen = true;
b.setup = 'let {id}_node = -1;';
b.handlers = [new Handler('onStart', 'if ({id}_node < 0) {\n  {id}_node = ui.createNode(ui.IMAGE);\n  ui.setImage({id}_node, {p:image});\n  show({id}_node);\n}\n{emit:onDone}();')];

b = box('button', 'Button', 'Screen', 'A button on the screen; fires onClick when pressed.', '', 'onClick');
b.params = [str('label', 'Press me', 'Button label')];
b.modules = ['zinc:ui'];
b.screen = true;
b.start = 'const {id}_btn = ui.createNode(ui.BUTTON);\nui.setClass({id}_btn, \'px-5 py-2 rounded-lg bg-zinc-900 active:bg-zinc-700\');\nconst {id}_label = ui.createText({p:label});\nui.setClass({id}_label, \'text-base text-white\');\nui.insert({id}_btn, {id}_label, -1);\nui.listen({id}_btn, () => { {emit:onClick}(); });\nshow({id}_btn);';

b = box('slider', 'Slider', 'Screen', 'A horizontal slider; emits its value while dragged.', '', 'value:n');
b.params = [num('min', '0', 'Value at the left end', -1e12, 1e12), num('max', '100', 'Value at the right end', -1e12, 1e12)];
b.modules = ['zinc:ui'];
b.screen = true;
b.start = 'const {id}_track = ui.createNode(ui.VIEW);\nui.setClass({id}_track, \'w-[240] h-[8] rounded-full bg-zinc-200\');\nconst {id}_knob = ui.createNode(ui.VIEW);\nui.setClass({id}_knob, \'absolute top-[-6] left-[0] w-[20] h-[20] rounded-full bg-zinc-900\');\nui.insert({id}_track, {id}_knob, -1);\nconst {id}_set = (x: number): void => {\n  const t = Math.max(0, Math.min(1, x / 240));\n  ui.setNumber({id}_knob, \'left\', t * 220);\n  {emit:value}({p:min} + t * ({p:max} - {p:min}));\n};\nui.onPointer({id}_track, ui.PDOWN, (e: ui.PointerEvent) => { {id}_set(e.x); });\nui.onPointer({id}_track, ui.PMOVE, (e: ui.PointerEvent) => { {id}_set(e.x); });\nshow({id}_track);';

// ---------------------------------------------------------------- Media
b = box('play_video', 'Play Video', 'Media', 'Plays a video file from the project assets (FFmpeg).', 'onStart onStop', 'onDone');
b.params = [asset('file', 'clip.mp4', 'Video asset'), bool('loop', 'true', 'Loop forever'), num('width', '480', 'Width in pixels', 16, 4096)];
b.modules = ['zinc:ui', 'zinc:video'];
b.screen = true;
b.setup = 'let {id}_player: video.Player | null = null;';
b.handlers = [
  new Handler('onStart', 'if ({id}_player !== null) return;\nconst p = new video.Player(0, 0);\np.add(ASSETS + {p:file});\np.repeat = {p:loop} ? video.LOOP : video.ONE_SHOT;\np.play();\n{id}_player = p;\nconst c = ui.createNode(ui.CANVAS);\nui.setClass(c, \'w-[{raw:width}] h-[{raw:width}]\');\nui.draw(c, (x: i32, y: i32, w: i32, h: i32) => { p.draw(x, y, w, h * 9 / 16); });\nshow(c);\n{emit:onDone}();'),
  new Handler('onStop', 'const p = {id}_player;\nif (p !== null) p.stop();'),
];

b = box('play_lottie', 'Play Lottie', 'Media', 'Plays a Lottie animation (JSON asset); onDone fires when it ends (at once when looping).', 'onStart', 'onDone');
b.params = [asset('file', 'orbit.json', 'Lottie JSON asset'), bool('loop', 'true', 'Loop forever'), num('size', '160', 'Size in pixels', 16, 2048)];
b.modules = ['zinc:ui', 'zinc:lottie'];
b.screen = true;
b.setup = 'let {id}_node = -1;';
b.handlers = [new Handler('onStart', 'if ({id}_node >= 0) return;\nlet seconds = 0;\n{id}_node = lottie.Lottie({ src: {p:file}, loop: {p:loop}, autoplay: true, class: \'w-[{raw:size}] h-[{raw:size}]\',\n  player: (pl: lottie.Player) => { seconds = lottie.duration(pl.anim); } });\nshow({id}_node);\nif ({p:loop}) {emit:onDone}();\nelse setTimeout(() => { {emit:onDone}(); }, seconds * 1000);')];

// ---------------------------------------------------------------- Network
b = box('http_get', 'HTTP Get', 'Network', 'Fetches a URL; emits the body text, or fires onError.', 'onStart', 'body:s onError');
b.params = [str('url', 'https://example.com', 'URL (http or https)')];
b.modules = ['zinc:net'];
b.setup = 'async function {id}_get(): Promise<void> {\n  try {\n    const r = await net.fetch({p:url});\n    const body = await r.text();\n    {emit:body}(body);\n  } catch (e) {\n    console.error(\'HTTP Get failed:\', e);\n    {emit:onError}();\n  }\n}';
b.handlers = [new Handler('onStart', '{id}_get();')];

b = box('osc_send', 'OSC Send', 'Network', 'Sends an OSC message with the last value when triggered or when the value changes.', 'onStart value:n', '');
b.params = [str('host', '127.0.0.1', 'Destination host'), num('port', '9000', 'UDP port', 1, 65535), str('address', '/zinc/value', 'OSC address')];
b.modules = ['zinc:osc'];
b.setup = 'let {id}_value = 0;';
b.handlers = [
  new Handler('onStart', 'osc.send({p:host}, {p:port}, {p:address}, [{id}_value]);'),
  new Handler('value', '{id}_value = v;\nosc.send({p:host}, {p:port}, {p:address}, [v]);'),
];

b = box('osc_receive', 'OSC Receive', 'Network', 'Listens for an OSC address; emits its first number.', '', 'onMessage value:n');
b.params = [num('port', '9000', 'UDP port', 1, 65535), str('address', '/zinc/value', 'OSC address')];
b.modules = ['zinc:osc'];
b.start = 'osc.listen({p:port}, (m: osc.OscMessage) => {\n  if (m.address !== {p:address}) return;\n  {emit:value}(m.numbers.length > 0 ? m.numbers[0] : 0);\n  {emit:onMessage}();\n});';

b = box('mqtt_publish', 'MQTT Publish', 'Network', 'Publishes a message (or the payload input) to a topic.', 'onStart payload:s', '');
b.params = [str('host', '127.0.0.1', 'Broker host'), num('port', '1883', 'Broker port', 1, 65535), str('topic', 'zinc/studio', 'Topic'), str('message', 'hello', 'Message sent on onStart')];
b.modules = ['zinc:mqtt'];
b.setup = 'let {id}_client: mqtt.MqttClient | null = null;\nasync function {id}_publish(payload: string): Promise<void> {\n  try {\n    if ({id}_client === null) {\n      const c = new mqtt.MqttClient({p:host}, {p:port}, \'studio-{id}\');\n      await c.connect();\n      {id}_client = c;\n    }\n    const c = {id}_client;\n    if (c !== null) c.publish({p:topic}, payload);\n  } catch (e) {\n    console.error(\'MQTT Publish failed:\', e);\n  }\n}';
b.handlers = [new Handler('onStart', '{id}_publish({p:message});'), new Handler('payload', '{id}_publish(v);')];

b = box('mqtt_subscribe', 'MQTT Subscribe', 'Network', 'Subscribes to a topic; emits every payload.', '', 'message:s');
b.params = [str('host', '127.0.0.1', 'Broker host'), num('port', '1883', 'Broker port', 1, 65535), str('topic', 'zinc/#', 'Topic filter')];
b.modules = ['zinc:mqtt'];
b.setup = 'async function {id}_subscribe(): Promise<void> {\n  try {\n    const c = new mqtt.MqttClient({p:host}, {p:port}, \'studio-{id}\');\n    await c.connect();\n    c.subscribe({p:topic}, (topic: string, payload: string) => { {emit:message}(payload); });\n  } catch (e) {\n    console.error(\'MQTT Subscribe failed:\', e);\n  }\n}';
b.start = '{id}_subscribe();';

// ---------------------------------------------------------------- IO
b = box('gpio_write', 'GPIO Write', 'IO', 'Drives an output pin high or low (simulator on desktop hosts).', 'onHigh onLow', '');
b.params = [num('pin', '17', 'GPIO pin (BCM)', 0, 63)];
b.modules = ['zinc:gpio'];
b.start = 'gpio.setup({p:pin}, \'out\', \'none\');';
b.handlers = [new Handler('onHigh', 'gpio.write({p:pin}, 1);'), new Handler('onLow', 'gpio.write({p:pin}, 0);')];

b = box('gpio_read', 'GPIO Read', 'IO', 'Watches an input pin; emits its value on every edge.', '', 'onRising onFalling value:n');
b.params = [num('pin', '27', 'GPIO pin (BCM)', 0, 63), choice('pull', 'up', 'Pull resistor', ['up', 'down', 'none'])];
b.modules = ['zinc:gpio'];
b.start = 'gpio.setup({p:pin}, \'in\', {p:pull});\ngpio.watch({p:pin}, \'both\', 20, (e: gpio.PinEdge) => {\n  {emit:value}(e.value);\n  if (e.value === 1) {emit:onRising}();\n  else {emit:onFalling}();\n});';

b = box('led_text', 'LED Matrix Text', 'IO', 'Scrolls text in a 5x7 pixel font (pair it with the ws2812 display on a matrix).', 'onStart text:s', '');
b.params = [str('text', 'ZINC', 'Text'), num('speed', '20', 'Pixels per second', 0, 1000)];
b.screen = true;
b.modules = ['zinc:ui', 'zinc:gfx', 'zinc:pixelfont'];
b.setup = 'let {id}_text = {p:text};\nlet {id}_x = 0;';
b.handlers = [
  new Handler('onStart', 'const img = gfx.createImage(64, 8);\nconst c = ui.createNode(ui.CANVAS);\nui.setClass(c, \'w-[384] h-[48] rounded-md\');\nui.draw(c, (x: i32, y: i32, w: i32, h: i32) => {\n  // one image pixel per LED, scaled up on the screen\n  {id}_x += {p:speed} / 60;\n  if ({id}_x > pixelfont.textWidth({id}_text, pixelfont.FONT_5X7) + 64) {id}_x = 0;\n  gfx.beginImage(img);\n  gfx.clear(0x000000);\n  pixelfont.drawText(64 - {id}_x, 0, {id}_text, 0xffb000, pixelfont.FONT_5X7, 0, 64);\n  gfx.endImage();\n  gfx.drawImage(img, x, y, w, h, 255, 0);\n});\nshow(c);'),
  new Handler('text', '{id}_text = v;'),
];

// ---------------------------------------------------------------- Debug
b = box('log', 'Log', 'Debug', 'Writes a message (or the message input) to the log.', 'onStart message:s', 'onDone');
b.params = [str('message', 'Hello from ZincStudio', 'Text written'), choice('level', 'log', 'Log level', ['log', 'info', 'warn', 'error'])];
b.handlers = [new Handler('onStart', 'console.{raw:level}({p:message});\n{emit:onDone}();'), new Handler('message', 'console.{raw:level}(v);')];

b = box('script', 'Script', 'Debug', 'Your own Zinc code (edit it in the Script tab). Call onDone() to continue the flow.', 'onStart', 'onDone');
// the script body is stored on the box instance; codegen.ts wraps it in the onStart handler

/** Default code of a new Script box. */
export const DEFAULT_SCRIPT = "// Runs when onStart fires. Any Zinc code works here; call onDone() to continue the flow.\nconsole.log('script box ran');\nonDone();\n";
