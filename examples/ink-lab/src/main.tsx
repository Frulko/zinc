// Ink Lab: write on the rectangle, read what zinc:ink recognised beside it (live while the pen is down, final once the mark settles).
import { render, For } from 'zinc:ui/solid';
import { repaint } from 'zinc:ui';
import { RemarkableApp, RemarkableBar, setPenMode } from 'zinc:remarkable';
import { Icon } from 'zinc:icons';
import { stroke, text, penCount } from 'zinc:gfx';
import { Recognition, Candidate } from 'zinc:ink';
import { NETS, net, chooseNet, ink, MODES, mode, guess, marks, latency, Mark, afterDraw, labStep, label, restart, undoStroke, chooseMode, openBox } from './lab';
import { replayStep, replaying, setPad } from './replay';

function frame(x: number, y: number, w: number, h: number, color: u32, t: number): void {
  stroke([x, y, x + w, y, x + w, y + h, x, y + h], t, color, 255, true);
}

/** The writing rectangle: pen samples in, ink and the boxes of the marks out (canvas-local coordinates). */
function pad(x: i32, y: i32, w: i32, h: i32): void {
  setPad(w, h);
  ink.draw(x, y, w, h);
  frame(x + 2, y + 2, w - 4, h - 4, 0x000000, 3);   // over the ink's own image, which covers the canvas
  afterDraw();
  for (const m of marks()) {
    const b = m.box;
    frame(x + b[0] - 8, y + b[1] - 8, b[2] - b[0] + 16, b[3] - b[1] + 16, 0x000000, 3);
    text(x + b[0] - 8, y + b[1] - 28, m.r === null ? '…' : label(m.r), 0x000000, 2);
  }
  const o = openBox();
  if (o !== null) frame(x + o[0] - 8, y + o[1] - 8, o[2] - o[0] + 16, o[3] - o[1] + 16, 0x777777, 2);
}

function pct(s: number): string { return Math.round(s * 100) + '%'; }

function Chip(props: { text: string; on?: boolean; onClick: () => void; label: string }): i32 {
  return <Button onClick={props.onClick} aria-label={props.label} className={'px-4 h-[52] rounded-[8] border-[3] border-black items-center justify-center flex-row gap-2 ' + (props.on ? 'bg-black' : 'bg-white')}>
    <Text className={'text-[15px] font-bold ' + (props.on ? 'text-white' : 'text-black')}>{props.text}</Text>
  </Button>;
}

function Result(): i32 {
  return <View className="gap-3">
    <View className="flex-row items-end gap-4">
      <Text className="text-[110px] font-black text-black w-[170]">{guess() === null ? '' : label(guess() as Recognition)}</Text>
      <View className="grow basis-0 min-w-0 gap-1 pb-3">
        <Text className="text-[16px] font-bold text-black">{guess() === null ? 'write something' : (guess() as Recognition).kind === 'unknown' ? 'not sure' : (guess() as Recognition).kind + ((guess() as Recognition).circled ? ', circled' : '')}</Text>
        <Text className="text-[13px] text-black">{guess() === null ? '' : 'match ' + (guess() as Recognition).ms.toFixed(1) + ' ms · shown ' + latency() + ' ms after pen'}</Text>
      </View>
    </View>
    <For each={guess() === null ? [] : (guess() as Recognition).candidates.slice(0, 5)}>{(c: Candidate) =>
      <View className="flex-row items-center gap-2">
        <Text className="w-[64] text-[16px] font-bold text-black">{c.label}</Text>
        <View className="grow basis-0 h-[18] border-[2] border-black"><View style={{ width: Math.max(2, Math.round(Math.min(1, c.score) * 200)) }} className="h-full bg-black" /></View>
        <Text className="w-[52] text-[13px] text-black text-right">{pct(c.score)}</Text>
      </View>}</For>
  </View>;
}

function App(): i32 {
  return <View className="w-full h-full bg-white flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
    <RemarkableBar title="Ink Lab" />
    <View className="h-[64] px-4 flex-row items-center border-b-[3] border-black gap-3 shrink-0">
      <View className="grow" />
      <For each={NETS}>{(n: string, i: number) => <Chip text={n} label={'Net: ' + n} on={net() === i} onClick={() => chooseNet(i)} />}</For>
      <View className="w-[3] h-[40] bg-black" />
      <For each={MODES}>{(m: string, i: number) => <Chip text={m} label={'Classes: ' + m} on={mode() === i} onClick={() => chooseMode(i)} />}</For>
      <Button onClick={undoStroke} aria-label="Undo last stroke" className="h-[52] px-4 rounded-[8] border-[3] border-black bg-white items-center justify-center flex-row gap-2"><Icon name="undo-2" size={22} strokeWidth={2.5} color={() => 0x000000} /><Text className="text-[15px] font-bold text-black">Undo</Text></Button>
      <Button onClick={restart} aria-label="Restart" className="h-[52] px-4 rounded-[8] border-[7] border-black bg-white items-center justify-center flex-row gap-2"><Icon name="rotate-ccw" size={22} strokeWidth={2.5} color={() => 0x000000} /><Text className="text-[15px] font-bold text-black">Restart</Text></Button>
    </View>
    <View className="grow basis-0 min-h-0 flex-row">
      <View className="grow basis-0 min-w-0 p-4"><Canvas aria-label="Writing rectangle" className="grow bg-white" style={{ lazy: 1 }} onDraw={pad} /></View>
      <View className="w-[400] shrink-0 border-l-[3] border-black p-4 gap-4">
        <Result />
        <Text className="text-[13px] font-bold text-black">Settled marks</Text>
        <View className="flex-row flex-wrap gap-2">
          <For each={marks()}>{(m: Mark) => <View className="px-3 h-[40] border-[2] border-black rounded-[6] justify-center"><Text className="text-[14px] text-black">{m.r === null ? '…' : label(m.r) + ' ' + pct(m.r.candidates.length > 0 ? m.r.candidates[0].score : 0)}</Text></View>}</For>
        </View>
      </View>
    </View>
  </View>;
}

let penWaveform = false;
render(() => <RemarkableApp app={App} />, 0xffffff, (dt: number) => {
  // on the first frame: the driver has chosen its layer by then, so the Pen waveform is answered
  if (!penWaveform) { penWaveform = true; setPenMode(true); }
  replayStep(); labStep(dt);
  if (penCount() > 0 || replaying()) repaint();   // the writing canvas is lazy: only pen samples draw it, the panel sees nothing else move
});
