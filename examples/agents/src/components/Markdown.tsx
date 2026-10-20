// An answer's markdown (services/markdown.ts) as views: each paragraph, heading, item, quote and table cell is one
// selectable text whose inline marks are style runs (ui.setTextRuns), so a sentence selects and copies (Cmd+C) as it
// reads. A code block is monospace under its language, with a copy button.
import { createSignal, createNodeRef, onMount, onCleanup } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { setClipboardText } from 'zinc:gfx';
import { Icon } from 'zinc:icons';
import { Block, Inline, B_HEADING, B_ITEM, B_QUOTE, B_CODE, B_TABLE, B_RULE, R_CODE, R_LINK } from '../services/markdown';
import { SURFACE, SURFACE_HOVER, BAR, BORDER, TEXT, MUTED, FAINT, CODE, CODE_TEXT, ACCENT, bg, fg, bd, color, varName } from '../theme';

/** How long « Copied » shows. */
const COPIED_MS = 1500;

/** A copy icon with a tooltip (« Copy », then « Copied » for a moment); `text` is read when it is pressed. */
export function CopyButton(props: { text: () => string; label?: string }): i32 {
  const [hover, setHover] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const at = createNodeRef();
  let timer: i32 = -1;
  onCleanup(() => { if (timer >= 0) clearTimeout(timer); });
  const press = (): void => {
    setClipboardText(props.text());
    setCopied(true);
    if (timer >= 0) clearTimeout(timer);
    timer = setTimeout(() => { timer = -1; setCopied(false); }, COPIED_MS);
  };
  return <View ref={at} className={`h-[22] px-1 flex-row items-center rounded cursor-pointer transition-colors duration-150 hover:${bg(SURFACE_HOVER)}`}
    aria-label={props.label ?? 'Copy'} onPress={press}
    onPointerEnter={(e: ui.PointerEvent) => setHover(true)} onPointerLeave={(e: ui.PointerEvent) => setHover(false)}>
    <Icon name={copied() ? 'check' : 'copy'} size={13} color={() => color(copied() ? ACCENT : FAINT)} />
    {(hover() || copied()) && <Tip anchor={at.node} text={() => copied() ? 'Copied' : props.label ?? 'Copy'} />}
  </View>;
}

/** A small label over `anchor`, in a layer. */
export function Tip(props: { anchor: i32; text: () => string }): i32 {
  const ref = createNodeRef();
  onMount(() => { ui.openLayer(ref.node, { priority: 300 }); ui.anchor(ref.node, props.anchor, 'top', 4); });
  return <View ref={ref} className={`px-2 py-1 rounded border ${bg(BAR)} ${bd(BORDER)}`}>
    <Text className={`text-[11px] ${fg(TEXT)}`}>{props.text()}</Text>
  </View>;
}

/** One selectable text with its inline runs; their colours are scheme variables, so they follow a scheme switch. */
export function RichText(props: { inline: Inline; className: string }): i32 {
  const x = props.inline;
  const ref = createNodeRef();
  if (!x.plain()) onMount(() => {
    const r: i32[] = [];
    for (let k = 0; k < x.runs.length; k += 3) {
      r.push(x.runs[k]); r.push(x.runs[k + 1]);
      r.push(x.runs[k + 2] === R_CODE ? CODE_COLOR : x.runs[k + 2] === R_LINK ? LINK_COLOR : -1);
    }
    ui.setTextRuns(ref.node, r);
  });
  return <Text ref={ref} className={`select-text break-words ${props.className}`}>{x.text}</Text>;
}
const CODE_COLOR = ui.schemeColor(varName(CODE_TEXT)), LINK_COLOR = ui.schemeColor(varName(ACCENT));

function CodeBlock(props: { block: Block }): i32 {
  const b = props.block;
  return <View className={`flex-col rounded-md border ${bd(BORDER)} ${bg(CODE)}`}>
    <View className={`flex-row items-center h-[26] pl-3 pr-1 border-b ${bd(BORDER)}`}>
      <Text className={`grow text-[11px] ${fg(FAINT)}`}>{b.lang === '' ? 'code' : b.lang}</Text>
      <CopyButton text={() => b.code} label="Copy code" />
    </View>
    <Text className={`select-text px-3 py-2 font-mono text-[12px] whitespace-pre-wrap break-words ${fg(TEXT)}`}>{b.code}</Text>
  </View>;
}

function Table(props: { block: Block }): i32 {
  const b = props.block;
  return <View className={`flex-col rounded-md border ${bd(BORDER)}`}>
    {b.rows.map((row: Inline[], r: i32) =>
      <View className={`flex-row ${r > 0 ? `border-t ${bd(BORDER)}` : bg(SURFACE)}`}>
        {row.map((cell: Inline) =>
          <View className="grow basis-0 min-w-0 px-2 py-1">
            <RichText inline={cell} className={`text-[13px] ${r === 0 ? 'font-semibold' : ''} ${fg(TEXT)}`} />
          </View>)}
      </View>)}
  </View>;
}

const HEADING_SIZE = ['text-[18px]', 'text-[16px]', 'text-[15px]', 'text-[14px]', 'text-[14px]', 'text-[14px]'];

function BlockView(props: { block: Block; small: boolean }): i32 {
  const b = props.block;
  const body = `${props.small ? 'text-[12px] leading-[18px]' : 'text-[14px] leading-[21px]'} ${fg(props.small ? MUTED : TEXT)}`;
  if (b.kind === B_HEADING) return <RichText inline={b.inline} className={`mt-1 font-semibold ${HEADING_SIZE[b.level - 1]} ${fg(TEXT)}`} />;
  if (b.kind === B_ITEM) return <View className="flex-row gap-2" style={{ paddingLeft: b.level * 18 }}>
    <Text className={`shrink-0 min-w-[14] text-right ${body} ${fg(b.marker === '•' ? FAINT : MUTED)}`}>{b.marker}</Text>
    <View className="grow shrink min-w-0"><RichText inline={b.inline} className={body} /></View>
  </View>;
  if (b.kind === B_QUOTE) return <View className={`border-l-2 pl-3 ${bd(BORDER)}`}><RichText inline={b.inline} className={`${body} ${fg(MUTED)}`} /></View>;
  if (b.kind === B_CODE) return <CodeBlock block={b} />;
  if (b.kind === B_TABLE) return <Table block={b} />;
  if (b.kind === B_RULE) return <View className={`h-[1] ${bg(BORDER)}`} />;
  return <RichText inline={b.inline} className={body} />;
}

/** The blocks of a finished text. */
export function Markdown(props: { blocks: Block[]; small: boolean }): i32 {
  return <View className="flex-col gap-2">
    {props.blocks.map((b: Block) => <BlockView block={b} small={props.small} />)}
  </View>;
}
