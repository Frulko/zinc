// The do / don't pictures of docs/design.md, drawn by Zinc. One picture per run, chosen by PICTURE:
//   PICTURE=accent ZINC_HEADLESS=1 ZINC_SCALE=2 ZINC_SIZE=760x300 ZINC_FRAMES=2 ZINC_SHOT=docs/img/design/accent.png zinc run docs/img/design/src
// PICTURE=gallery draws the Quiet theme's gallery after CUI's components screen (ZINC_SIZE=1440x980), SCHEME=dark and ACCENT=blue... vary it.
// The rules follow CUI's docs/design.md (github.com/yappologistic/CUI, MIT).
import { render } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { useQuietTheme, setTheme, DARK } from 'zinc:ui/kit';
import { Gallery } from './gallery/gallery';
import { PAGE, SURFACE, FOREGROUND, SECONDARY, HAIRLINE, EDGE, CONTROL, ACCENT_SOFT, FOCUS, SUCCESS, DANGER, FLOATING_SHADOW } from './tokens';

interface PanelProps { good: boolean; caption: string; children: () => i32 }

/** One half of a picture: a "Do" or "Don't" label, the caption, then the example. */
function Panel(props: PanelProps): i32 {
  return <View className="flex-col gap-3 grow basis-0">
    <View className="flex-row items-center gap-2">
      <Text className={`text-[13px] font-medium text-${props.good ? SUCCESS : DANGER}`}>{props.good ? 'Do' : "Don't"}</Text>
      <Text className={`text-[13px] text-${SECONDARY}`}>{props.caption}</Text>
    </View>
    <View className="flex-col grow">{props.children()}</View>
  </View>;
}

function Label(props: { text: string; className?: string }): i32 {
  return <Text className={`text-[13px] text-${FOREGROUND} ${props.className ?? ''}`}>{props.text}</Text>;
}

function SolidButton(props: { label: string; fill: string }): i32 {
  return <View className={`h-[30px] px-[11px] items-center justify-center rounded-[10px] bg-${props.fill}`}>
    <Text className="text-[13px] font-medium text-white">{props.label}</Text>
  </View>;
}

function QuietButton(props: { label: string }): i32 {
  return <View className={`h-[30px] px-[11px] items-center justify-center rounded-[10px] border border-${HAIRLINE} bg-${SURFACE}`}>
    <Text className={`text-[13px] font-medium text-${FOREGROUND}`}>{props.label}</Text>
  </View>;
}

// ---- 1. Neutral surfaces, one accent, status colours for status only
function Row(props: { name: string; detail: string; selected: boolean; dot: string }): i32 {
  return <View className={`flex-row items-center gap-2 h-[34px] px-2 rounded-[8px] ${props.selected ? 'bg-' + ACCENT_SOFT : ''}`}>
    <View className={`w-[6px] h-[6px] rounded-full bg-${props.dot}`} />
    <Label text={props.name} className="grow" />
    <Text className={`text-[12px] text-${SECONDARY}`}>{props.detail}</Text>
  </View>;
}

function AccentPicture(): i32 {
  return <View className="flex-row gap-6 grow">
    <Panel good={true} caption="greys, one accent for the action">
      <View className={`flex-col gap-1 p-[10px] rounded-[18px] border border-${HAIRLINE} bg-${SURFACE}`}>
        <Row name="linux-arm64-02" detail="online" selected={true} dot={SUCCESS} />
        <Row name="mac-mini-07" detail="online" selected={false} dot={SUCCESS} />
        <Row name="win-x64-11" detail="failed" selected={false} dot={DANGER} />
        <View className="flex-row gap-2 pt-2 px-2">
          <SolidButton label="Add runner" fill={CONTROL} />
          <QuietButton label="Cancel" />
        </View>
      </View>
    </Panel>
    <Panel good={false} caption="colour as decoration">
      <View className="flex-col gap-1 p-[10px] rounded-[18px] bg-[#efe7ff]">
        <Row name="linux-arm64-02" detail="online" selected={true} dot="[#7c3aed]" />
        <Row name="mac-mini-07" detail="online" selected={false} dot="[#f97316]" />
        <Row name="win-x64-11" detail="failed" selected={false} dot="[#06b6d4]" />
        <View className="flex-row gap-2 pt-2 px-2">
          <SolidButton label="Add runner" fill="[#7c3aed]" />
          <SolidButton label="Import" fill="[#16a34a]" />
          <SolidButton label="Cancel" fill="[#f97316]" />
        </View>
      </View>
    </Panel>
  </View>;
}

// ---- 2. Hairline borders; shadows only on what floats; concentric corners
function MenuItem(props: { text: string; on: boolean }): i32 {
  return <View className={`h-[30px] px-2 justify-center rounded-[8px] ${props.on ? 'bg-' + ACCENT_SOFT : ''}`}><Label text={props.text} /></View>;
}

function EdgesPicture(): i32 {
  return <View className="flex-row gap-6 grow">
    <Panel good={true} caption="a border at rest, a shadow when it floats">
      <View className={`h-[150px] p-4 rounded-[18px] border border-${HAIRLINE} bg-${SURFACE}`}>
        <Label text="Build cache" className="font-medium" />
        <Text className={`text-[12px] text-${SECONDARY}`}>68.4 of 100 GB used</Text>
        <View className={`absolute left-[110px] top-[56px] w-[170px] flex-col p-[6px] rounded-[14px] border border-${HAIRLINE} bg-${SURFACE} ${FLOATING_SHADOW}`}>
          <MenuItem text="Clear cache" on={true} />
          <MenuItem text="Move to disk..." on={false} />
          <MenuItem text="Settings" on={false} />
        </View>
      </View>
    </Panel>
    <Panel good={false} caption="shadow and border, card in a card">
      <View className="h-[150px] p-4 rounded-[6px] border-2 border-[#c8c8c8] bg-white shadow-xl">
        <Label text="Build cache" className="font-bold" />
        <View className="mt-2 p-3 rounded-[22px] border border-[#c8c8c8] bg-white shadow-lg">
          <Text className={`text-[12px] text-${SECONDARY}`}>68.4 of 100 GB used</Text>
          <View className="mt-2 h-[30px] px-3 justify-center rounded-[22px] bg-[#e5e5e5]"><Label text="Clear cache" /></View>
        </View>
      </View>
    </Panel>
  </View>;
}

// ---- 3. Type and spacing: sizes and greys make the hierarchy, two weights, a 4 px grid with rhythm
function Field(props: { label: string; value: string; tight: boolean }): i32 {
  return <View className={`flex-col ${props.tight ? 'gap-[6px]' : 'gap-0'}`}>
    <Label text={props.label} className={props.tight ? 'font-medium' : 'font-bold'} />
    <View className={`h-[36px] px-3 justify-center rounded-[10px] border border-${props.tight ? EDGE : '[#d4d4d4]'} bg-${SURFACE}`}>
      <Label text={props.value} />
    </View>
  </View>;
}

function TypePicture(): i32 {
  return <View className="flex-row gap-6 grow">
    <Panel good={true} caption="16 inside a group, 24 between">
      <View className={`flex-col gap-6 p-5 rounded-[18px] border border-${HAIRLINE} bg-${SURFACE}`}>
        <View className="flex-col gap-1">
          <Text className={`text-[22px] font-medium text-${FOREGROUND}`}>Add a runner</Text>
          <Text className={`text-[13px] text-${SECONDARY}`}>Runners pick up jobs for the platforms you choose.</Text>
        </View>
        <View className="flex-col gap-4">
          <Field label="Name" value="linux-arm64-02" tight={true} />
        </View>
      </View>
    </Panel>
    <Panel good={false} caption="bold everywhere, one gap for all">
      <View className="flex-col gap-2 p-2 items-center rounded-[18px] border border-[#d4d4d4] bg-white">
        <View className="px-2 py-0.5 rounded-full bg-[#e0e7ff]"><Text className="text-[10px] font-bold text-[#4338ca]">NEW RUNNER</Text></View>
        <Text className="text-[26px] font-bold text-black">ADD A RUNNER</Text>
        <Text className="text-[15px] font-semibold text-black">Runners pick up jobs for the platforms you choose.</Text>
        <View className="w-full"><Field label="Name" value="linux-arm64-02" tight={false} /></View>
      </View>
    </Panel>
  </View>;
}

// ---- 4. Motion explains a change: a spring that lands without overshoot, and its reduced-motion path
/** A spring's position at time t (seconds) from 0 to 1: CUI's model, a period `duration` and a bounce (damping ratio 1 - bounce). */
function springAt(t: number, duration: number, bounce: number): number {
  const w = 2 * Math.PI / duration, z = 1 - bounce;
  if (z >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}

/** The 61 samples of a curve, one every 10 ms. */
const STEPS: i32[] = [];
for (let i = 0; i <= 60; i++) STEPS.push(i);

interface CurveProps { duration: number; bounce: number; color: string; label: string; cut: boolean }

/** A curve plotted as dots over 600 ms, 300 x 110 px; `cut` draws the reduced-motion path (the end at once). */
function Curve(props: CurveProps): i32 {
  const at = (i: i32): number => {
    const t = i * 0.01;
    if (props.cut) return 1;
    return props.duration > 0 ? springAt(t, props.duration, props.bounce) : 0.5 - 0.5 * Math.cos(t * 30);
  };
  return <View className="flex-col gap-1">
    <Text className={`text-[12px] text-${SECONDARY}`}>{props.label}</Text>
    <View className={`w-[306px] h-[106px] border-b border-${HAIRLINE}`}>
      <View className={`absolute left-0 right-0 top-[21px] h-px bg-${HAIRLINE}`} />
      {STEPS.map((i: i32) =>
        <View className={`absolute w-[4px] h-[4px] rounded-full bg-${props.color} left-[${i * 5}px] top-[${Math.round(100 - at(i) * 80)}px]`} />)}
    </View>
  </View>;
}

function MotionPicture(): i32 {
  return <View className="flex-row gap-6 grow">
    <Panel good={true} caption="a state lands; reduced motion cuts">
      <View className={`flex-col gap-2 p-4 rounded-[18px] border border-${HAIRLINE} bg-${SURFACE}`}>
        <Curve duration={0.32} bounce={0} color={CONTROL} label="disclosure: 320 ms spring, no overshoot" cut={false} />
        <Curve duration={0} bounce={0} color={EDGE} label="reduced motion: the final state at once" cut={true} />
      </View>
    </Panel>
    <Panel good={false} caption="bounce on a state, a loop for nothing">
      <View className={`flex-col gap-2 p-4 rounded-[18px] border border-${HAIRLINE} bg-${SURFACE}`}>
        <Curve duration={0.5} bounce={0.6} color={DANGER} label="a switch that wobbles past its place" cut={false} />
        <Curve duration={0} bounce={0} color={DANGER} label="a badge that pulses while nothing changes" cut={false} />
      </View>
    </Panel>
  </View>;
}

// ---- 5. Every control from the keyboard, with a visible ring for keyboard focus
function KeyboardPicture(): i32 {
  return <View className="flex-row gap-6 grow">
    <Panel good={true} caption="Tab shows a ring, the icon button has a name">
      <View className={`flex-col gap-4 p-5 rounded-[18px] border border-${HAIRLINE} bg-${SURFACE}`}>
        <View className={`h-[36px] px-3 justify-center rounded-[10px] border border-${EDGE}`}><Label text="https://kiln.app/r/2.4.0-rc.2" /></View>
        <View className="flex-row items-center gap-3">
          <View className={`h-[30px] px-[11px] items-center justify-center rounded-[10px] bg-${CONTROL} ring-2 ring-${FOCUS} ring-offset-2`}>
            <Text className="text-[13px] font-medium text-white">Copy link</Text>
          </View>
          <View className={`h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-${HAIRLINE}`}><Label text="⋯" /></View>
        </View>
        <View className={`absolute left-[124px] top-[106px] px-2 py-1 rounded-[8px] bg-${CONTROL} ${FLOATING_SHADOW}`}><Text className="text-[12px] text-white">More actions</Text></View>
      </View>
    </Panel>
    <Panel good={false} caption="focus you cannot see, a nameless icon">
      <View className={`flex-col gap-4 p-5 rounded-[18px] border border-${HAIRLINE} bg-${SURFACE}`}>
        <View className={`h-[36px] px-3 justify-center rounded-[10px] border border-${HAIRLINE}`}><Label text="https://kiln.app/r/2.4.0-rc.2" /></View>
        <View className="flex-row items-center gap-3">
          <View className="h-[30px] px-[11px] items-center justify-center rounded-[10px] bg-[#2a2a2a]">
            <Text className="text-[13px] font-medium text-white">Copy link</Text>
          </View>
          <View className={`h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-${HAIRLINE}`}><Label text="⋯" /></View>
        </View>
      </View>
    </Panel>
  </View>;
}

function Picture(): i32 {
  const which = env('PICTURE');
  return <View className={`flex-col h-full p-6 bg-${PAGE}`}>
    {which === 'edges' ? <EdgesPicture /> : which === 'type' ? <TypePicture /> : which === 'motion' ? <MotionPicture />
      : which === 'keyboard' ? <KeyboardPicture /> : <AccentPicture />}
  </View>;
}

useQuietTheme(env('ACCENT') === '' ? 'neutral' : env('ACCENT'));
if (env('SCHEME') === 'dark') setTheme(DARK);
render(env('PICTURE') === 'gallery' ? Gallery : Picture, env('SCHEME') === 'dark' ? 0x121212 : 0xf2f2f2, null);
