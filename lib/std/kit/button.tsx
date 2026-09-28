/** @jsxHelpers ./host */
// zinc:ui/kit — Button, after shadcn/ui's: variants default, secondary, outline, ghost, destructive; sizes sm,
// default, lg, icon. The text comes from `label`; `children` adds custom content after it (a Kbd, a Badge).
//
//   <Button label="Save changes" onClick={save} />
//   <Button label="Cancel" variant="outline" size="sm" onClick={close} />
import { theme, Theme } from './theme';
import { renderSlot } from './host';

export interface ButtonProps {
  label?: string;
  variant?: string;       // 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: string;          // 'sm' | 'default' | 'lg' | 'icon'
  onClick?: () => void;
  class?: string;         // extra layout classes ('grow', 'w-full'...)
  children?: () => i32;
}

/** Height, padding and radius per size. */
function sizeClass(size: string): string {
  if (size === 'sm') return 'h-8 px-3 gap-1.5 rounded-md';
  if (size === 'lg') return 'h-10 px-6 gap-2 rounded-md';
  if (size === 'icon') return 'h-9 w-9 px-0 rounded-md';
  return 'h-9 px-4 gap-2 rounded-md';
}

/** Fill, border and the focused / pressed fills of a variant. */
function surfaceClass(variant: string, t: Theme): string {
  if (variant === 'secondary') return `bg-${t.secondary} focus:bg-${t.secondaryPressed} active:bg-${t.secondaryPressed}`;
  if (variant === 'outline') return `bg-${t.card} border border-${t.border} shadow-sm focus:bg-${t.subtle} active:bg-${t.subtle}`;
  if (variant === 'ghost') return `bg-transparent focus:bg-${t.subtle} active:bg-${t.subtle}`;
  if (variant === 'destructive') return `bg-${t.destructive} shadow-sm focus:bg-${t.destructivePressed} active:bg-${t.destructivePressed}`;
  return `bg-${t.primary} shadow-sm focus:bg-${t.primaryFocus} active:bg-${t.primaryPressed}`;
}

/** Text colour of a variant. */
function labelColor(variant: string, t: Theme): string {
  if (variant === 'secondary' || variant === 'outline' || variant === 'ghost') return t.secondaryForeground;
  if (variant === 'destructive') return t.destructiveForeground;
  return t.primaryForeground;
}

export function Button(props?: ButtonProps): i32 {
  const variant = props?.variant ?? 'default';
  const size = props?.size ?? 'default';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  return <Button
    class={`flex-row items-center justify-center transition-colors ${sizeClass(size)} ${surfaceClass(variant, theme())} ${props?.class ?? ''}`}
    onClick={() => { const handler = props?.onClick; if (handler !== undefined) handler(); }}>
    <Show when={props?.label !== undefined}>
      <Text class={`${textSize} font-medium text-${labelColor(variant, theme())}`}>{props?.label ?? ''}</Text>
    </Show>
    {renderSlot(props?.children)}
  </Button>;
}
