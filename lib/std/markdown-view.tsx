/** @jsxHelpers zinc:ui/kit/host */
// Shared Markdown (markdown.ts) as views: each paragraph, heading, item, quote and table cell is one
// selectable text whose inline marks are style runs (ui.setTextRuns), so a sentence selects and copies (Cmd+C) as it
// reads. A code block is monospace under its language, with a copy button.
import { createNodeRef, onMount } from 'zinc:ui/solid';
import { componentEffect, componentSignal, componentRef } from 'zinc:ui/kit/host';
import * as ui from 'zinc:ui';
import { setClipboardText } from 'zinc:gfx';
import { Icon } from 'zinc:icons';
import { Block, Inline, B_HEADING, B_ITEM, B_QUOTE, B_CODE, B_TABLE, B_RULE, R_CODE, R_LINK } from './markdown';
import { SURFACE, SURFACE_HOVER, BAR, BORDER, TEXT, MUTED, FAINT, CODE, CODE_TEXT, ACCENT, bg, fg, bd, color, varName } from './markdown-theme';

/** How long « Copied » shows. */
const COPIED_MS = 1500;

/** A copy icon with a tooltip (« Copy », then « Copied » for a moment); `text` is read when it is pressed. */
export function CopyButton(props: { text: () => string; label?: string }): i32 {
  const [hover, setHover] = componentSignal(false);
  const [copied, setCopied] = componentSignal(false);
  const at = createNodeRef();
  const timer = componentRef<i32>(-1);
  componentEffect(() => () => { if (timer.current >= 0) clearTimeout(timer.current); }, []);
  const press = (): void => {
    setClipboardText(props.text());
    setCopied(true);
    if (timer.current >= 0) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = -1; setCopied(false); }, COPIED_MS);
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

enum LinkPressState { Idle, Pressed }
class LinkPress {
  state: LinkPressState = LinkPressState.Idle; index: i32 = -1; x: number = 0; y: number = 0;
  transition(next: LinkPressState, index: i32 = -1, x: number = 0, y: number = 0): boolean {
    if (next === this.state) return false;
    this.state = next; this.index = index; this.x = x; this.y = y; return true;
  }
}
/** Selectable styled text; links use the engine's actual wrapped glyph hit testing. */
export interface RichTextProps { inline: Inline; className: string; codeColor?: () => i32; linkColor?: () => i32; activeColor?: () => i32; onLink?: (href: string) => void; focus?: () => string }
function richRuns(props: RichTextProps, start: i32 = -1, end: i32 = -1): i32[] {
  const x = props.inline, r: i32[] = [];
  let offset: i32 = 0;
  for (let k = 0; k < x.runs.length; k += 3) {
    r.push(x.runs[k]); r.push(x.runs[k + 1]);
    const selected = start >= 0 && offset >= start && offset < end;
    r.push(selected && props.activeColor !== undefined ? props.activeColor() : x.runs[k + 2] === R_CODE ? (props.codeColor !== undefined ? props.codeColor() : ui.schemeColor(varName(CODE_TEXT))) : x.runs[k + 2] === R_LINK ? (props.linkColor !== undefined ? props.linkColor() : ui.schemeColor(varName(ACCENT))) : -1);
    offset += x.runs[k];
  }
  return r;
}
function PlainRichText(props: RichTextProps): i32 {
  const ref = createNodeRef();
  const node = <Text ref={ref} className={`select-text ${props.className}`}>{props.inline.text}</Text>;
  componentEffect(() => { ui.setTextRuns(ref.node, richRuns(props)); return undefined; });
  return node;
}
export function RichText(props: RichTextProps): i32 {
  if (props.onLink !== undefined && props.inline.links.length > 0) return <LinkedRichText inline={props.inline} className={props.className} codeColor={props.codeColor} linkColor={props.linkColor} activeColor={props.activeColor} onLink={props.onLink} focus={props.focus} />;
  return <PlainRichText inline={props.inline} className={props.className} codeColor={props.codeColor} linkColor={props.linkColor} />;
}
function LinkedRichText(props: RichTextProps): i32 {
  const x = props.inline, interactive = props.onLink !== undefined && x.links.length > 0;
  const ref = createNodeRef(), press = componentRef(new LinkPress());
  const [active, setActive] = componentSignal<i32>(0), [focused, setFocused] = componentSignal(false);
  const target = (): i32 => Math.min(active(), Math.max(0, x.links.length - 1));
  const hit = (e: ui.PointerEvent): i32 => {
    const at = ui.textOffsetAt(ref.node, e.x, e.y);
    for (let i: i32 = 0; i < x.links.length; i++) if (at >= x.linkRanges[i * 2] && at < x.linkRanges[i * 2 + 1]) return i;
    return -1;
  };
  const activate = (index: i32): void => { if (props.onLink !== undefined && index >= 0 && index < x.links.length) props.onLink(x.links[index]); };
  const node = <Text ref={ref} focusable={interactive} role={interactive ? 'link' : ''}
    aria-label={interactive ? x.text.slice(x.linkRanges[target() * 2], x.linkRanges[target() * 2 + 1]) + ': ' + x.links[target()] : ''}
    aria-description={interactive ? 'Left and right arrows choose a link. Enter or Space opens it.' : ''}
    className={`select-text ${props.className} ${interactive && props.focus !== undefined ? props.focus() : ''}`}
    onKeyDown={(e: ui.KeyEvent) => {
      if (!interactive) return;
      if (e.key === 'Enter' || e.key === ' ') activate(target());
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setActive((target() + (e.key === 'ArrowLeft' ? x.links.length - 1 : 1)) % x.links.length);
      else if (e.key === 'Home' || e.key === 'End') setActive(e.key === 'Home' ? 0 : x.links.length - 1);
      else return;
      e.preventDefault();
    }}
    onPointerDown={(e: ui.PointerEvent) => {
      if (!interactive || e.button !== 0) return;
      const index = hit(e);
      if (index >= 0) { press.current.transition(LinkPressState.Pressed, index, e.x, e.y); setActive(index); }
    }}
    onPointerMove={(e: ui.PointerEvent) => { if (press.current.state === LinkPressState.Pressed && Math.abs(e.x - press.current.x) + Math.abs(e.y - press.current.y) > 4) press.current.transition(LinkPressState.Idle); }}
    onPointerCancel={(e: ui.PointerEvent) => { press.current.transition(LinkPressState.Idle); }}
    onPointerUp={(e: ui.PointerEvent) => {
      const index = press.current.index, wasPressed = press.current.state === LinkPressState.Pressed;
      press.current.transition(LinkPressState.Idle);
      if (wasPressed && e.button === 0 && hit(e) === index) activate(index);
    }}>{x.text}</Text>;
  componentEffect(() => {
    ui.setTextRuns(ref.node, richRuns(props, focused() ? x.linkRanges[target() * 2] : -1, focused() ? x.linkRanges[target() * 2 + 1] : -1));
    return undefined;
  });
  componentEffect(() => {
    if (!interactive) return undefined;
    const dispose = ui.onFocusWithin(ref.node, setFocused);
    return () => { dispose(); press.current.transition(LinkPressState.Idle); };
  }, [interactive ? 1 : 0, ref.node]);
  return node;
}


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

function Table(props: { block: Block; options: MarkdownOptions }): i32 {
  const b = props.block, options = props.options;
  return <View className={`flex-col rounded-md border ${(options.border !== undefined ? options.border() : bd(BORDER))}`}>
    {b.rows.map((row: Inline[], r: i32) =>
      <View className={`flex-row ${r > 0 ? `border-t ${(options.border !== undefined ? options.border() : bd(BORDER))}` : (options.surface !== undefined ? options.surface() : bg(SURFACE))}`}>
        {row.map((cell: Inline, column: i32) =>
          <View className="grow basis-0 min-w-0 px-2 py-1">
            <RichText codeColor={options.codeColor} linkColor={options.linkColor} activeColor={options.activeColor} onLink={options.onLink} focus={options.focus} inline={cell} className={`text-[13px] ${r === 0 ? 'font-semibold' : ''} ${b.alignments[column] === 2 ? 'text-center' : b.alignments[column] === 3 ? 'text-right' : ''} ${(options.foreground !== undefined ? options.foreground() : fg(TEXT))}`} />
          </View>)}
      </View>)}
  </View>;
}

const HEADING_SIZE = ['text-[18px]', 'text-[16px]', 'text-[15px]', 'text-[14px]', 'text-[14px]', 'text-[14px]'];

function BlockView(props: { block: Block; small: boolean; options: MarkdownOptions }): i32 {
  const b = props.block;
  const options = props.options;
  const foreground = options.foreground !== undefined ? options.foreground() : fg(TEXT);
  const muted = options.muted !== undefined ? options.muted() : fg(MUTED);
  const body = `${options.bodyClass ?? (props.small ? 'text-[12px] leading-[18px]' : 'text-[14px] leading-[21px]')} ${props.small ? muted : foreground}`;
  if (b.kind === B_HEADING) return <RichText codeColor={options.codeColor} linkColor={options.linkColor} activeColor={options.activeColor} onLink={options.onLink} focus={options.focus} inline={b.inline} className={`mt-1 font-semibold ${HEADING_SIZE[b.level - 1]} ${(options.foreground !== undefined ? options.foreground() : fg(TEXT))}`} />;
  if (b.kind === B_ITEM) return <View className="flex-row items-start gap-2" style={{ paddingLeft: b.level * 18 }}>
    <Show when={b.task >= 0} fallback={<Text className={`shrink-0 min-w-[14] text-right ${body} ${muted}`}>{b.marker}</Text>}>
      <Button role="checkbox" aria-label={b.inline.text} aria-checked={b.task === 1 ? 'true' : 'false'} disabled={options.onTask === undefined}
        className={`w-[18px] h-[18px] shrink-0 items-center justify-center rounded-[5px] border ${options.border !== undefined ? options.border() : bd(BORDER)} ${options.focus !== undefined ? options.focus() : ''}`}
        onClick={() => { if (options.onTask !== undefined) options.onTask(b.taskOffset, b.task !== 1); }}>
        <Text className={`text-[12px] ${foreground}`}>{b.task === 1 ? '✓' : ''}</Text>
      </Button>
    </Show>
    <View className="grow shrink min-w-0 flex-col gap-2"><RichText codeColor={options.codeColor} linkColor={options.linkColor} activeColor={options.activeColor} onLink={options.onLink} focus={options.focus} inline={b.inline} className={body} /><Show when={b.blocks.length > 0}><Markdown blocks={b.blocks} small={props.small} options={options} /></Show></View>
  </View>;
  if (b.kind === B_QUOTE) return <View className={`border-l-2 pl-3 ${(options.border !== undefined ? options.border() : bd(BORDER))}`}><Show when={b.blocks.length > 0} fallback={<RichText codeColor={options.codeColor} linkColor={options.linkColor} activeColor={options.activeColor} onLink={options.onLink} focus={options.focus} inline={b.inline} className={`${body} ${muted}`} />}><Markdown blocks={b.blocks} small={props.small} options={options} /></Show></View>;
  if (b.kind === B_CODE) return options.code !== undefined ? options.code(b) : <CodeBlock block={b} />;
  if (b.kind === B_TABLE) return <Table block={b} options={options} />;
  if (b.kind === B_RULE) return <View className={`h-[1] ${options.border !== undefined ? 'border-t ' + options.border() : bg(BORDER)}`} />;
  return <RichText codeColor={options.codeColor} linkColor={options.linkColor} activeColor={options.activeColor} onLink={options.onLink} focus={options.focus} inline={b.inline} className={body} />;
}

/** The blocks of a finished text. */
export interface MarkdownOptions {
  code?: (block: Block) => i32;
  onLink?: (href: string) => void;
  onTask?: (offset: i32, checked: boolean) => void;
  className?: string;
  bodyClass?: string;
  focus?: () => string;
  foreground?: () => string;
  muted?: () => string;
  border?: () => string;
  surface?: () => string;
  codeColor?: () => i32;
  activeColor?: () => i32;
  linkColor?: () => i32;
}
export function Markdown(props: { blocks: Block[]; small: boolean; options?: MarkdownOptions }): i32 {
  const options = props.options ?? {};
  return <View className={'flex-col gap-2 ' + (options.className ?? '')}>
    {props.blocks.map((b: Block) => <BlockView block={b} small={props.small} options={options} />)}
  </View>;
}
