/** @jsxHelpers ./host */
// zinc:ui/nuxt, form and display components (ZN-357.02): Button, Badge, Avatar, Card, Input, Textarea, Select, Checkbox, Switch, RadioGroup with Nuxt UI 4's
// props (color, variant, size, label, icon, loading, disabled...), variants and sizes (variants.ts, docs/nuxt-ui.md). Written once for both UI models like
// zinc:ui/kit: under Solid the classes follow theme() and the accessors; under React a render reads them. Controlled values are an accessor
// (`modelValue`) and `onUpdate`, Vue's v-model. Icons are Lucide names (zinc:icons): name the ones a program uses in zinc.json "icons".
import { theme, hex, rounded } from './theme';
import { buttonSize, buttonIconSize, buttonVariant, contentColor, badgeSize, badgeIconSize, badgeVariant, avatarBox, inputSize, inputHeight, inputVariant,
  choiceText, checkboxBox, switchThumb, radioDot, checkedFill, choiceCard, rgb } from './variants';
import { renderSlot } from './host';
import { Icon } from 'zinc:icons';

export type ButtonProps = {
  label?: string; color?: string; variant?: string; size?: string; icon?: string; trailingIcon?: string; square?: boolean; block?: boolean;
  loading?: boolean; disabled?: boolean; onClick?: () => void; class?: string; children?: () => i32;
};
/** Nuxt UI's UButton: solid / outline / soft / subtle / ghost / link, xs..xl, a leading or trailing Lucide icon, loading spins the leading one. */
export function Button(p: ButtonProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'solid', size = p.size ?? 'md';
  const square = p.square ?? (p.label === undefined && p.children === undefined);
  const off = (p.disabled ?? false) || (p.loading ?? false);
  const lead = p.loading === true ? 'loader-circle' : p.icon ?? '';
  const ink = (): i32 => rgb(contentColor(theme(), color, variant));
  return <View class={`flex-row items-center font-medium transition-colors ${rounded('md')} ${buttonSize(size, square)} ${buttonVariant(theme(), color, variant)} ${p.block === true ? 'w-full justify-center' : ''} ${off ? 'opacity-75' : ''} ${p.class ?? ''}`}
    onClick={() => { const f = p.onClick; if (!off && f !== undefined) f(); }} role="button" aria-label={p.label ?? lead}>
    <Show when={lead !== ''}><Icon name={lead} size={buttonIconSize(size)} color={ink} /></Show>
    <Show when={p.label !== undefined}><Text class={`text-${hex(contentColor(theme(), color, variant))}`}>{p.label ?? ''}</Text></Show>
    {renderSlot(p.children)}
    <Show when={p.trailingIcon !== undefined}><Icon name={p.trailingIcon ?? ''} size={buttonIconSize(size)} color={ink} /></Show>
  </View>;
}

export type BadgeProps = { label?: string; color?: string; variant?: string; size?: string; icon?: string; class?: string };
/** Nuxt UI's UBadge: solid / outline / soft / subtle, xs..xl. */
export function Badge(p: BadgeProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'solid', size = p.size ?? 'md';
  return <View class={`flex-row items-center font-medium ${badgeSize(size, p.label === undefined)} ${badgeVariant(theme(), color, variant)} ${p.class ?? ''}`}>
    <Show when={p.icon !== undefined}><Icon name={p.icon ?? ''} size={badgeIconSize(size)} color={() => rgb(contentColor(theme(), color, variant))} /></Show>
    <Show when={p.label !== undefined}><Text class={`text-${hex(contentColor(theme(), color, variant))}`}>{p.label ?? ''}</Text></Show>
  </View>;
}

export type AvatarProps = { src?: string; alt?: string; text?: string; icon?: string; size?: string; color?: string; chip?: boolean; class?: string };
/** Nuxt UI's UAvatar: an image, else the text or the initials of `alt`, else an icon; 3xs..3xl; `chip` adds the status dot. */
export function Avatar(p: AvatarProps): i32 {
  const n = avatarBox(p.size ?? 'md'), color = p.color ?? 'neutral';
  const initials = (): string => {
    if (p.text !== undefined) return p.text as string;
    const words = (p.alt ?? '').split(' ').filter((w: string) => w.length > 0);
    return words.length === 0 ? '' : words.length === 1 ? words[0].charAt(0).toUpperCase() : (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  };
  const fg = (): string => color === 'neutral' ? theme().textMuted : theme().color(color);
  return <View class={`items-center justify-center rounded-full relative w-[${n}px] h-[${n}px] bg-${color === 'neutral' ? hex(theme().bgElevated) : hex(theme().color(color), 10)} ${p.class ?? ''}`}>
    <Show when={p.src !== undefined}><Image class="w-full h-full rounded-full overflow-hidden" src={p.src ?? ''} /></Show>
    <Show when={p.src === undefined && p.icon !== undefined}><Icon name={p.icon ?? ''} size={n / 2} color={() => rgb(fg())} /></Show>
    <Show when={p.src === undefined && p.icon === undefined}><Text class={`font-medium text-[${Math.round(n / 2)}px] text-${hex(fg())}`}>{initials()}</Text></Show>
    <Show when={p.chip === true}><View class={`absolute right-0 bottom-0 rounded-full w-[${Math.round(n / 4)}px] h-[${Math.round(n / 4)}px] bg-${hex(theme().success)} border-2 border-${hex(theme().bg)}`} /></Show>
  </View>;
}

export type CardProps = { title?: string; description?: string; variant?: string; class?: string; header?: () => i32; children?: () => i32; footer?: () => i32 };
/** Nuxt UI's UCard: outline / solid / soft / subtle; a header (title, description or the header slot), the body (children), a footer. */
export function Card(p: CardProps): i32 {
  const variant = p.variant ?? 'outline';
  const box = (): string => {
    const t = theme();
    if (variant === 'solid') return `bg-${hex(t.bgInverted)}`;
    if (variant === 'soft') return `bg-${hex(t.bgElevated, 50)}`;
    if (variant === 'subtle') return `bg-${hex(t.bgElevated, 50)} border border-${hex(t.border)}`;
    return `bg-${hex(t.bg)} border border-${hex(t.border)}`;
  };
  const title = (): string => variant === 'solid' ? theme().textInverted : theme().textHighlighted;
  const sub = (): string => variant === 'solid' ? theme().textDimmed : theme().textMuted;
  const hasHead = p.title !== undefined || p.description !== undefined || p.header !== undefined;
  return <View class={`flex-col overflow-hidden ${rounded('lg')} ${box()} ${p.class ?? ''}`}>
    <Show when={hasHead}>
      <View class={`flex-col p-4 border-b border-${hex(theme().border)}`}>
        <Show when={p.title !== undefined}><Text class={`font-semibold text-${hex(title())}`}>{p.title ?? ''}</Text></Show>
        <Show when={p.description !== undefined}><Text class={`mt-1 text-sm text-${hex(sub())}`}>{p.description ?? ''}</Text></Show>
        {renderSlot(p.header)}
      </View>
    </Show>
    <View class="flex-col p-4 gap-3">{renderSlot(p.children)}</View>
    <Show when={p.footer !== undefined}><View class={`flex-row p-4 gap-2 border-t border-${hex(theme().border)}`}>{renderSlot(p.footer)}</View></Show>
  </View>;
}

export type InputProps = {
  modelValue?: () => string; onUpdate?: (v: string) => void; placeholder?: string; color?: string; variant?: string; size?: string;
  icon?: string; trailingIcon?: string; highlight?: boolean; disabled?: boolean; type?: string; class?: string;
};
/** Nuxt UI's UInput: outline / soft / subtle / ghost / none, xs..xl (desktop text sizes), a leading or trailing icon, `type="password"`. */
export function Input(p: InputProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'outline', size = p.size ?? 'md';
  const pad = `${p.icon !== undefined ? 'pl-[' + (inputHeight(size) + 4) + 'px]' : ''} ${p.trailingIcon !== undefined ? 'pr-[' + (inputHeight(size) + 4) + 'px]' : ''}`;
  const dim = (): i32 => rgb(theme().textDimmed);
  return <View class={`relative w-full ${p.class ?? ''}`}>
    <Input class={`w-full h-[${inputHeight(size)}px] ${inputSize(size)} ${inputVariant(theme(), color, variant, p.highlight ?? false)} ${pad}`}
      value={p.modelValue !== undefined ? (p.modelValue as () => string)() : ''} placeholder={p.placeholder ?? ''}
      onInput={(v: string) => { const f = p.onUpdate; if (f !== undefined) f(v); }} password={p.type === 'password'} readOnly={p.disabled ?? false} />
    <Show when={p.icon !== undefined}><View class={`absolute left-0 top-0 h-[${inputHeight(size)}px] w-[${inputHeight(size)}px] items-center justify-center`}><Icon name={p.icon ?? ''} size={buttonIconSize(size)} color={dim} /></View></Show>
    <Show when={p.trailingIcon !== undefined}><View class={`absolute right-0 top-0 h-[${inputHeight(size)}px] w-[${inputHeight(size)}px] items-center justify-center`}><Icon name={p.trailingIcon ?? ''} size={buttonIconSize(size)} color={dim} /></View></Show>
  </View>;
}

export type TextareaProps = { modelValue?: () => string; onUpdate?: (v: string) => void; placeholder?: string; color?: string; variant?: string; size?: string; rows?: number; disabled?: boolean; class?: string };
/** Nuxt UI's UTextarea: Input's variants and sizes, `rows` lines (3). */
export function Textarea(p: TextareaProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'outline', size = p.size ?? 'md';
  return <TextArea class={`w-full ${inputSize(size)} ${inputVariant(theme(), color, variant, false)} ${p.class ?? ''}`} rows={p.rows ?? 3}
    value={p.modelValue !== undefined ? (p.modelValue as () => string)() : ''} placeholder={p.placeholder ?? ''}
    onInput={(v: string) => { const f = p.onUpdate; if (f !== undefined) f(v); }} readOnly={p.disabled ?? false} />;
}

export type SelectProps = { items: string[]; modelValue?: () => string; onUpdate?: (v: string) => void; placeholder?: string; color?: string; variant?: string; size?: string; open?: () => boolean; onOpen?: (open: boolean) => void; class?: string };
/** Nuxt UI's USelect: Input's trigger with a chevron; the list opens under it (ZN-357.03 moves it to a floating layer). `open` / `onOpen` let the caller hold
 *  the open state (pass both for the list to open). */
export function Select(p: SelectProps): i32 {
  const color = p.color ?? 'primary', variant = p.variant ?? 'outline', size = p.size ?? 'md';
  const value = (): string => p.modelValue !== undefined ? (p.modelValue as () => string)() : '';
  const isOpen = (): boolean => p.open !== undefined && (p.open as () => boolean)();
  const setOpen = (v: boolean): void => { const f = p.onOpen; if (f !== undefined) f(v); };
  return <View class={`relative w-full ${p.class ?? ''}`}>
    <View class={`flex-row items-center w-full h-[${inputHeight(size)}px] ${inputSize(size)} ${inputVariant(theme(), color, variant, isOpen())}`} onClick={() => setOpen(!isOpen())} role="combobox">
      <Text class={`grow truncate text-${hex(value() === '' ? theme().textDimmed : theme().textHighlighted)}`}>{value() === '' ? (p.placeholder ?? '') : value()}</Text>
      <Icon name="chevron-down" size={buttonIconSize(size)} color={() => rgb(theme().textDimmed)} />
    </View>
    <Show when={isOpen()}>
      <View class={`absolute left-0 right-0 top-[${inputHeight(size) + 8}px] z-50 flex-col p-1 shadow-lg ${rounded('md')} bg-${hex(theme().bg)} border border-${hex(theme().border)}`}>
        <For each={p.items}>{(it: string, i: i32) => <View class={`flex-row items-center gap-1.5 p-1.5 ${rounded('md')} hover:bg-${hex(theme().bgElevated, 50)}`} onClick={() => { const f = p.onUpdate; if (f !== undefined) f(it); setOpen(false); }}>
          <Text class={`grow text-sm text-${hex(theme().text)}`}>{it}</Text>
          <Show when={it === value()}><Icon name="check" size={16} color={() => rgb(theme().textDimmed)} /></Show>
        </View>}</For>
      </View>
    </Show>
  </View>;
}

export type CheckboxProps = { modelValue?: () => boolean; onUpdate?: (v: boolean) => void; label?: string; description?: string; color?: string; size?: string; variant?: string; disabled?: boolean; required?: boolean; class?: string };
/** Nuxt UI's UCheckbox: list or card variant, xs..xl, label and description, `required` adds a red star. */
export function Checkbox(p: CheckboxProps): i32 {
  const color = p.color ?? 'primary', size = p.size ?? 'md', box = checkboxBox(size);
  const on = (): boolean => p.modelValue !== undefined && (p.modelValue as () => boolean)();
  const flip = (): void => { const f = p.onUpdate; if (!(p.disabled ?? false) && f !== undefined) f(!on()); };
  return <View class={`flex-row items-start gap-2 ${p.variant === 'card' ? choiceCard(theme(), color, on(), size) : ''} ${p.disabled === true ? 'opacity-75' : ''} ${p.class ?? ''}`} onClick={flip} role="checkbox" aria-checked={on()}>
    <View class={`items-center justify-center mt-[2px] w-[${box}px] h-[${box}px] ${rounded('sm')} ${on() ? 'bg-' + hex(checkedFill(theme(), color)) : 'border border-' + hex(theme().borderAccented)}`}>
      <Show when={on()}><Icon name="check" size={box - 2} color={() => rgb(theme().textInverted)} strokeWidth={3} /></Show>
    </View>
    <View class="flex-col">
      <Show when={p.label !== undefined}><Text class={`${choiceText(size)} font-medium text-${hex(theme().text)}`}>{(p.label ?? '') + (p.required === true ? ' *' : '')}</Text></Show>
      <Show when={p.description !== undefined}><Text class={`${choiceText(size)} text-${hex(theme().textMuted)}`}>{p.description ?? ''}</Text></Show>
    </View>
  </View>;
}

export type SwitchProps = { modelValue?: () => boolean; onUpdate?: (v: boolean) => void; label?: string; description?: string; color?: string; size?: string; disabled?: boolean; class?: string };
/** Nuxt UI's USwitch: the thumb inside a 2 px transparent border (md: 36 x 20, thumb 16), checked fill of the colour. */
export function Switch(p: SwitchProps): i32 {
  const color = p.color ?? 'primary', size = p.size ?? 'md', k = switchThumb(size);
  const on = (): boolean => p.modelValue !== undefined && (p.modelValue as () => boolean)();
  const flip = (): void => { const f = p.onUpdate; if (!(p.disabled ?? false) && f !== undefined) f(!on()); };
  return <View class={`flex-row items-center gap-2 ${p.disabled === true ? 'opacity-75' : ''} ${p.class ?? ''}`} onClick={flip} role="switch" aria-checked={on()}>
    <View class={`flex-row items-center rounded-full p-[2px] w-[${k * 2 + 4}px] h-[${k + 4}px] transition-colors bg-${hex(on() ? checkedFill(theme(), color) : theme().bgAccented)}`}>
      <View class={`rounded-full shadow-lg w-[${k}px] h-[${k}px] bg-${hex(theme().bg)}`} style={{ translateX: on() ? k : 0 }} />
    </View>
    <View class="flex-col">
      <Show when={p.label !== undefined}><Text class={`${choiceText(size)} font-medium text-${hex(theme().text)}`}>{p.label ?? ''}</Text></Show>
      <Show when={p.description !== undefined}><Text class={`${choiceText(size)} text-${hex(theme().textMuted)}`}>{p.description ?? ''}</Text></Show>
    </View>
  </View>;
}

export type RadioGroupProps = { items: string[]; modelValue?: () => string; onUpdate?: (v: string) => void; legend?: string; color?: string; size?: string; variant?: string; orientation?: string; disabled?: boolean; class?: string };
/** Nuxt UI's URadioGroup: list or card variant, vertical or horizontal, xs..xl; the checked circle is filled with a dot of the background. */
export function RadioGroup(p: RadioGroupProps): i32 {
  const color = p.color ?? 'primary', size = p.size ?? 'md', box = checkboxBox(size), dot = radioDot(size);
  const value = (): string => p.modelValue !== undefined ? (p.modelValue as () => string)() : '';
  return <View class={`flex-col gap-1 ${p.disabled === true ? 'opacity-75' : ''} ${p.class ?? ''}`} role="radiogroup">
    <Show when={p.legend !== undefined}><Text class={`mb-1 ${choiceText(size)} font-medium text-${hex(theme().text)}`}>{p.legend ?? ''}</Text></Show>
    <View class={`${p.orientation === 'horizontal' ? 'flex-row' : 'flex-col'} gap-2`}>
      <For each={p.items}>{(it: string, i: i32) => <View class={`flex-row items-center gap-2 ${p.variant === 'card' ? choiceCard(theme(), color, it === value(), size) : ''}`}
        onClick={() => { const f = p.onUpdate; if (!(p.disabled ?? false) && f !== undefined) f(it); }} role="radio" aria-checked={it === value()}>
        <View class={`items-center justify-center rounded-full w-[${box}px] h-[${box}px] ${it === value() ? 'bg-' + hex(checkedFill(theme(), color)) : 'border border-' + hex(theme().borderAccented)}`}>
          <Show when={it === value()}><View class={`rounded-full w-[${dot}px] h-[${dot}px] bg-${hex(theme().bg)}`} /></Show>
        </View>
        <Text class={`${choiceText(size)} text-${hex(theme().text)}`}>{it}</Text>
      </View>}</For>
    </View>
  </View>;
}
