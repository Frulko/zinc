/** @jsxHelpers ./host */
// zinc:ui/nuxt, form and display components (ZN-357.02): Button, Badge, Avatar, Card, Input, Textarea, Select, Checkbox, Switch, RadioGroup with Nuxt UI 4's
// props (color, variant, size, label, icon, loading, disabled...), variants and sizes (variants.ts, docs/nuxt-ui.md). Written once for both UI models like
// zinc:ui/kit: under Solid the classes follow theme() and the accessors; under React a render reads them. Controlled values are an accessor
// (`modelValue`) and `onUpdate`, Vue's v-model. Icons are Lucide names (zinc:icons): name the ones a program uses in zinc.json "icons".
import * as ui from 'zinc:ui';
import { theme, hex, mix, rounded } from './theme';
import { buttonSize, buttonIconSize, buttonVariant, contentColor, badgeSize, badgeIconSize, badgeVariant, avatarBox, inputSize, inputHeight, inputVariant,
  choiceText, checkboxBox, switchThumb, radioDot, checkedFill, choiceCard, rgb } from './variants';
import { renderSlot } from './host';
import { Icon } from 'zinc:icons';
import { look, toggleFeedback } from '../platform/index';

export type ButtonProps = {
  label?: string; color?: string; variant?: string; size?: string; icon?: string; trailingIcon?: string; square?: boolean; block?: boolean;
  loading?: boolean; disabled?: boolean; onClick?: () => void; className?: string; children?: () => i32;
};
/** Nuxt UI's UButton: solid / outline / soft / subtle / ghost / link, xs..xl, a leading or trailing Lucide icon, loading spins the leading one. */
export function Button(p: ButtonProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'solid', size = p.size ?? 'md';
  const square = p.square ?? (p.label === undefined && p.children === undefined);
  const off = (p.disabled ?? false) || (p.loading ?? false);
  const lead = p.loading === true ? 'loader-circle' : p.icon ?? '';
  const ink = (): i32 => rgb(contentColor(theme(), color, variant));
  return <View className={`flex-row items-center font-medium transition-colors ${rounded('md')} ${buttonSize(size, square)} ${buttonVariant(theme(), color, variant)} ${p.block === true ? 'w-full justify-center' : ''} ${off ? 'opacity-75' : ''} ${p.className ?? ''}`}
    onClick={() => { const f = p.onClick; if (!off && f !== undefined) f(); }} role="button" aria-label={p.label ?? lead}>
    <Show when={lead !== ''}><Icon name={lead} size={buttonIconSize(size)} color={ink} /></Show>
    <Show when={p.label !== undefined}><Text className={`text-${hex(contentColor(theme(), color, variant))}`}>{p.label ?? ''}</Text></Show>
    {renderSlot(p.children)}
    <Show when={p.trailingIcon !== undefined}><Icon name={p.trailingIcon ?? ''} size={buttonIconSize(size)} color={ink} /></Show>
  </View>;
}

export type BadgeProps = { label?: string; color?: string; variant?: string; size?: string; icon?: string; className?: string };
/** Nuxt UI's UBadge: solid / outline / soft / subtle, xs..xl. */
export function Badge(p: BadgeProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'solid', size = p.size ?? 'md';
  return <View className={`flex-row items-center font-medium ${badgeSize(size, p.label === undefined)} ${badgeVariant(theme(), color, variant)} ${p.className ?? ''}`}>
    <Show when={p.icon !== undefined}><Icon name={p.icon ?? ''} size={badgeIconSize(size)} color={() => rgb(contentColor(theme(), color, variant))} /></Show>
    <Show when={p.label !== undefined}><Text className={`text-${hex(contentColor(theme(), color, variant))}`}>{p.label ?? ''}</Text></Show>
  </View>;
}

export type AvatarProps = { src?: string; alt?: string; text?: string; icon?: string; size?: string; color?: string; chip?: boolean; className?: string };
/** Nuxt UI's UAvatar: an image, else the text or the initials of `alt`, else an icon; 3xs..3xl; `chip` adds the status dot. */
export function Avatar(p: AvatarProps): i32 {
  const n = avatarBox(p.size ?? 'md'), color = p.color ?? 'neutral';
  const initials = (): string => {
    if (p.text !== undefined) return p.text as string;
    const words = (p.alt ?? '').split(' ').filter((w: string) => w.length > 0);
    return words.length === 0 ? '' : words.length === 1 ? words[0].charAt(0).toUpperCase() : (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  };
  const fg = (): string => color === 'neutral' ? theme().textMuted : theme().color(color);
  return <View className={`items-center justify-center rounded-full relative w-[${n}px] h-[${n}px] bg-${color === 'neutral' ? hex(theme().bgElevated) : hex(mix(theme().color(color), 10, theme().bg))} ${p.className ?? ''}`}>
    <Show when={p.src !== undefined}><Image className="w-full h-full rounded-full overflow-hidden" src={p.src ?? ''} /></Show>
    <Show when={p.src === undefined && p.icon !== undefined}><Icon name={p.icon ?? ''} size={n / 2} color={() => rgb(fg())} /></Show>
    <Show when={p.src === undefined && p.icon === undefined}><Text className={`font-medium text-[${Math.round(n / 2)}px] text-${hex(fg())}`}>{initials()}</Text></Show>
    <Show when={p.chip === true}><View className={`absolute right-0 bottom-0 rounded-full w-[${Math.round(n / 4)}px] h-[${Math.round(n / 4)}px] bg-${hex(theme().success)} border-2 border-${hex(theme().bg)}`} /></Show>
  </View>;
}

export type CardProps = { title?: string; description?: string; variant?: string; className?: string; header?: () => i32; children?: () => i32; footer?: () => i32 };
/** Nuxt UI's UCard: outline / solid / soft / subtle; a header (title, description or the header slot), the body (children), a footer. */
export function Card(p: CardProps): i32 {
  const variant = p.variant ?? 'outline';
  const box = (): string => {
    const t = theme();
    if (variant === 'solid') return `bg-${hex(t.bgInverted)}`;
    if (variant === 'soft') return `bg-${hex(mix(t.bgElevated, 50, theme().bg))}`;
    if (variant === 'subtle') return `bg-${hex(mix(t.bgElevated, 50, theme().bg))} border border-${hex(t.border)}`;
    return `bg-${hex(t.bg)} border border-${hex(t.border)}`;
  };
  const title = (): string => variant === 'solid' ? theme().textInverted : theme().textHighlighted;
  const sub = (): string => variant === 'solid' ? theme().textDimmed : theme().textMuted;
  const hasHead = p.title !== undefined || p.description !== undefined || p.header !== undefined;
  return <View className={`flex-col overflow-hidden ${rounded('lg')} ${box()} ${p.className ?? ''}`}>
    <Show when={hasHead}>
      <View className={`flex-col p-4 border-b border-${hex(theme().border)}`}>
        <Show when={p.title !== undefined}><Text className={`font-semibold text-${hex(title())}`}>{p.title ?? ''}</Text></Show>
        <Show when={p.description !== undefined}><Text className={`mt-1 text-sm text-${hex(sub())}`}>{p.description ?? ''}</Text></Show>
        {renderSlot(p.header)}
      </View>
    </Show>
    <View className="flex-col p-4 gap-3">{renderSlot(p.children)}</View>
    <Show when={p.footer !== undefined}><View className={`flex-row p-4 gap-2 border-t border-${hex(theme().border)}`}>{renderSlot(p.footer)}</View></Show>
  </View>;
}

export type InputProps = {
  modelValue?: () => string; onUpdate?: (v: string) => void; placeholder?: string; color?: string; variant?: string; size?: string;
  icon?: string; trailingIcon?: string; highlight?: boolean; disabled?: boolean; type?: string; className?: string;
};
/** Nuxt UI's UInput: outline / soft / subtle / ghost / none, xs..xl (desktop text sizes), a leading or trailing icon, `type="password"`. */
export function Input(p: InputProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'outline', size = p.size ?? 'md';
  const pad = `${p.icon !== undefined ? 'pl-[' + (inputHeight(size) + 4) + 'px]' : ''} ${p.trailingIcon !== undefined ? 'pr-[' + (inputHeight(size) + 4) + 'px]' : ''}`;
  const dim = (): i32 => rgb(theme().textDimmed);
  return <View className={`relative w-full ${p.className ?? ''}`}>
    <Input className={`w-full h-[${inputHeight(size)}px] ${inputSize(size)} ${inputVariant(theme(), color, variant, p.highlight ?? false)} ${pad}`}
      value={p.modelValue !== undefined ? (p.modelValue as () => string)() : ''} placeholder={p.placeholder ?? ''}
      onInput={(v: string) => { const f = p.onUpdate; if (f !== undefined) f(v); }} password={p.type === 'password'} readOnly={p.disabled ?? false} />
    <Show when={p.icon !== undefined}><View className={`absolute left-0 top-0 h-[${inputHeight(size)}px] w-[${inputHeight(size)}px] items-center justify-center`}><Icon name={p.icon ?? ''} size={buttonIconSize(size)} color={dim} /></View></Show>
    <Show when={p.trailingIcon !== undefined}><View className={`absolute right-0 top-0 h-[${inputHeight(size)}px] w-[${inputHeight(size)}px] items-center justify-center`}><Icon name={p.trailingIcon ?? ''} size={buttonIconSize(size)} color={dim} /></View></Show>
  </View>;
}

export type TextareaProps = { modelValue?: () => string; onUpdate?: (v: string) => void; placeholder?: string; color?: string; variant?: string; size?: string; rows?: number; disabled?: boolean; className?: string };
/** Nuxt UI's UTextarea: Input's variants and sizes, `rows` lines (3). */
export function Textarea(p: TextareaProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'outline', size = p.size ?? 'md';
  return <TextArea className={`w-full ${inputSize(size)} ${inputVariant(theme(), color, variant, false)} ${p.className ?? ''}`} rows={p.rows ?? 3}
    value={p.modelValue !== undefined ? (p.modelValue as () => string)() : ''} placeholder={p.placeholder ?? ''}
    onInput={(v: string) => { const f = p.onUpdate; if (f !== undefined) f(v); }} readOnly={p.disabled ?? false} />;
}

export type SelectProps = { items: string[]; modelValue?: () => string; onUpdate?: (v: string) => void; placeholder?: string; color?: string; variant?: string; size?: string; open?: () => boolean; onOpen?: (open: boolean) => void; className?: string };
/** Nuxt UI's USelect: Input's trigger with a chevron; the list opens under it (ZN-357.03 moves it to a floating layer). `open` / `onOpen` let the caller hold
 *  the open state (pass both for the list to open). */
export function Select(p: SelectProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'outline', size = p.size ?? 'md';
  const value = (): string => p.modelValue !== undefined ? (p.modelValue as () => string)() : '';
  const isOpen = (): boolean => p.open !== undefined && (p.open as () => boolean)();
  const setOpen = (v: boolean): void => { const f = p.onOpen; if (f !== undefined) f(v); };
  return <View className={`relative w-full ${p.className ?? ''}`}>
    <View className={`flex-row items-center w-full h-[${inputHeight(size)}px] ${inputSize(size)} ${inputVariant(theme(), color, variant, isOpen())}`} onClick={() => setOpen(!isOpen())} role="combobox">
      <Text className={`grow truncate text-${hex(value() === '' ? theme().textDimmed : theme().textHighlighted)}`}>{value() === '' ? (p.placeholder ?? '') : value()}</Text>
      <Icon name="chevron-down" size={buttonIconSize(size)} color={() => rgb(theme().textDimmed)} />
    </View>
    <Show when={isOpen()}>
      <View className={`absolute left-0 right-0 top-[${inputHeight(size) + 8}px] z-50 flex-col p-1 shadow-lg ${rounded('md')} bg-${hex(theme().bg)} border border-${hex(theme().border)}`}>
        <For each={p.items}>{(it: string, i: i32) => <View className={`flex-row items-center gap-1.5 p-1.5 ${rounded('md')} hover:bg-${hex(mix(theme().bgElevated, 50, theme().bg))}`} onClick={() => { const f = p.onUpdate; if (f !== undefined) f(it); setOpen(false); }}>
          <Text className={`grow text-sm text-${hex(theme().text)}`}>{it}</Text>
          <Show when={it === value()}><Icon name="check" size={16} color={() => rgb(theme().textDimmed)} /></Show>
        </View>}</For>
      </View>
    </Show>
  </View>;
}

export type CheckboxProps = { modelValue?: () => boolean; onUpdate?: (v: boolean) => void; label?: string; description?: string; color?: string; size?: string; variant?: string; disabled?: boolean; required?: boolean; className?: string };
/** Nuxt UI's UCheckbox: list or card variant, xs..xl, label and description, `required` adds a red star. */
export function Checkbox(p: CheckboxProps): i32 {
  const color = p.color ?? 'primary', size = p.size ?? 'md', box = checkboxBox(size);
  const on = (): boolean => p.modelValue !== undefined && (p.modelValue as () => boolean)();
  const flip = (): void => { const f = p.onUpdate; if (!(p.disabled ?? false) && f !== undefined) f(!on()); };
  return <View className={`flex-row items-start gap-2 ${p.variant === 'card' ? choiceCard(theme(), color, on(), size) : ''} ${p.disabled === true ? 'opacity-75' : ''} ${p.className ?? ''}`} onClick={flip} role="checkbox" aria-checked={on()}>
    <View className={`items-center justify-center mt-[2px] w-[${box}px] h-[${box}px] ${rounded('sm')} ${on() ? 'bg-' + hex(checkedFill(theme(), color)) : 'border border-' + hex(theme().borderAccented)}`}>
      <Show when={on()}><Icon name="check" size={box - 2} color={() => rgb(theme().textInverted)} strokeWidth={3} /></Show>
    </View>
    <View className="flex-col">
      <Show when={p.label !== undefined}><Text className={`${choiceText(size)} font-medium text-${hex(theme().text)}`}>{(p.label ?? '') + (p.required === true ? ' *' : '')}</Text></Show>
      <Show when={p.description !== undefined}><Text className={`${choiceText(size)} text-${hex(theme().textMuted)}`}>{p.description ?? ''}</Text></Show>
    </View>
  </View>;
}

export type SwitchProps = { modelValue?: () => boolean; onUpdate?: (v: boolean) => void; label?: string; description?: string; color?: string; size?: string; disabled?: boolean; className?: string };
/** Nuxt UI's USwitch: the thumb inside a 2 px transparent border (md: 36 x 20, thumb 16), checked fill of the colour. Under a platform look (zinc:ui/platform)
 *  the shape is the platform's (iOS 51 x 31, Material 3 52 x 32 with an outline and a growing thumb, macOS 38 x 22) and the colours stay Nuxt UI's. */
export function Switch(p: SwitchProps): i32 {
  const color = p.color ?? 'primary', size = p.size ?? 'md', L = look(), own = L.name === 'neutral';
  const on = (): boolean => p.modelValue !== undefined && (p.modelValue as () => boolean)();
  const flip = (): void => { const f = p.onUpdate; if (!(p.disabled ?? false) && f !== undefined) { toggleFeedback(); f(!on()); } };
  // the track and thumb: Nuxt UI's sizes, or the platform's with the thumb centred on the left when off and on the right when on
  const k = (o: boolean): number => own ? switchThumb(size) : o ? L.thumbOn : L.thumbOff, w = own ? switchThumb(size) * 2 + 4 : L.switchW, h = own ? switchThumb(size) + 4 : L.switchH;
  const edge = own ? 0 : L.outline, inner = w - 2 * edge, innerH = h - 2 * edge, rtl = ui.isRtl() ? -1 : 1;
  const x = (o: boolean): number => own ? (o ? k(o) * rtl : 0) : rtl * (o ? inner - (innerH - k(o)) / 2 - k(o) : (innerH - k(o)) / 2);
  return <View className={`flex-row items-center gap-2 ${p.disabled === true ? 'opacity-75' : ''} ${p.className ?? ''}`} onClick={flip} role="switch" aria-checked={on()}>
    <View className={`flex-row items-center rounded-full ${own ? 'p-[2px]' : edge > 0 ? `border-[${edge}px] border-${hex(on() ? checkedFill(theme(), color) : theme().borderAccented)}` : ''} w-[${w}px] h-[${h}px] transition-colors bg-${hex(on() ? checkedFill(theme(), color) : theme().bgAccented)}`}>
      <View className={`rounded-full ${edge > 0 ? '' : 'shadow-lg'} w-[${k(on())}px] h-[${k(on())}px] bg-${hex(edge > 0 && !on() ? theme().textMuted : theme().bg)}`} style={{ translateX: x(on()) }} />
    </View>
    <View className="flex-col">
      <Show when={p.label !== undefined}><Text className={`${choiceText(size)} font-medium text-${hex(theme().text)}`}>{p.label ?? ''}</Text></Show>
      <Show when={p.description !== undefined}><Text className={`${choiceText(size)} text-${hex(theme().textMuted)}`}>{p.description ?? ''}</Text></Show>
    </View>
  </View>;
}

export type RadioGroupProps = { items: string[]; modelValue?: () => string; onUpdate?: (v: string) => void; legend?: string; color?: string; size?: string; variant?: string; orientation?: string; disabled?: boolean; className?: string };
/** Nuxt UI's URadioGroup: list or card variant, vertical or horizontal, xs..xl; the checked circle is filled with a dot of the background. */
export function RadioGroup(p: RadioGroupProps): i32 {
  const color = p.color ?? 'primary', size = p.size ?? 'md', box = checkboxBox(size), dot = radioDot(size);
  const value = (): string => p.modelValue !== undefined ? (p.modelValue as () => string)() : '';
  return <View className={`flex-col gap-1 ${p.disabled === true ? 'opacity-75' : ''} ${p.className ?? ''}`} role="radiogroup">
    <Show when={p.legend !== undefined}><Text className={`mb-1 ${choiceText(size)} font-medium text-${hex(theme().text)}`}>{p.legend ?? ''}</Text></Show>
    <View className={`${p.orientation === 'horizontal' ? 'flex-row' : 'flex-col'} gap-2`}>
      <For each={p.items}>{(it: string, i: i32) => <View className={`flex-row items-center gap-2 ${p.variant === 'card' ? choiceCard(theme(), color, it === value(), size) : ''}`}
        onClick={() => { const f = p.onUpdate; if (!(p.disabled ?? false) && f !== undefined) f(it); }} role="radio" aria-checked={it === value()}>
        <View className={`items-center justify-center rounded-full w-[${box}px] h-[${box}px] ${it === value() ? 'bg-' + hex(checkedFill(theme(), color)) : 'border border-' + hex(theme().borderAccented)}`}>
          <Show when={it === value()}><View className={`rounded-full w-[${dot}px] h-[${dot}px] bg-${hex(theme().bg)}`} /></Show>
        </View>
        <Text className={`${choiceText(size)} text-${hex(theme().text)}`}>{it}</Text>
      </View>}</For>
    </View>
  </View>;
}
