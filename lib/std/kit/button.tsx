/** @jsxHelpers ./host */
// zinc:ui/kit — Button, after shadcn/ui's: variants default, secondary, outline, ghost, destructive; sizes sm,
// default, lg, icon. The text comes from `label`; `children` adds custom content after it (a Kbd, a Badge).
//
//   <Button label="Save changes" onClick={save} />
//   <Button label="Cancel" variant="outline" size="sm" onClick={close} />
import { theme, Theme } from './theme';
import { renderSlot } from './host';
import { look } from '../platform/index';

export interface ButtonProps {
  label?: string;
  variant?: string;       // 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: string;          // 'sm' | 'default' | 'lg' | 'icon'
  onClick?: () => void;
  className?: string;         // extra layout classes ('grow', 'w-full'...)
  children?: () => i32;
}

/** Height, padding and radius per size: the platform look's (zinc:ui/platform; neutral: shadcn/ui's h-8, h-9, h-10). */
function sizeClass(size: string): string {
  const b = look().button;
  return size === 'sm' ? b[0] : size === 'lg' ? b[2] : size === 'icon' ? b[3] : b[1];
}

/** Fill, border and the focused / pressed fills of a variant. */
function surfaceClass(variant: string, t: Theme): string {
  if (variant === 'secondary') return `bg-${t.secondary} focus:bg-${t.secondaryPressed} active:bg-${t.secondaryPressed}`;
  if (variant === 'outline') return `bg-${t.card} border border-${t.border} shadow-sm focus:bg-${t.subtle} active:bg-${t.subtle}`;
  if (variant === 'ghost') return `bg-transparent focus:bg-${t.subtle} active:bg-${t.subtle}`;
  if (variant === 'destructive') return `bg-${t.destructive} shadow-sm focus:bg-${t.destructivePressed} active:bg-${t.destructivePressed}`;
  if (tinted(t)) return `bg-[var(--pfTint)] focus:bg-[var(--pfTintPressed)] active:bg-[var(--pfTintPressed)]${look().name === 'macos' ? ' shadow-sm' : ''}`;
  return `bg-${t.primary} shadow-sm focus:bg-${t.primaryFocus} active:bg-${t.primaryPressed}`;
}

/** The default button is filled with the platform's tint (systemBlue, Material's primary, the Mac's accent) when the app keeps the kit's own theme;
 *  a theme of its own keeps its primary colour. */
function tinted(t: Theme): boolean { return t.name === 'vars' && look().name !== 'neutral'; }

/** Text colour of a variant. */
function labelColor(variant: string, t: Theme): string {
  if (variant === 'secondary' || variant === 'outline' || variant === 'ghost') return t.secondaryForeground;
  if (variant === 'destructive') return t.destructiveForeground;
  return tinted(t) ? '[var(--pfOnTint)]' : t.primaryForeground;
}

export function Button(props?: ButtonProps): i32 {
  const variant = props?.variant ?? 'default';
  const size = props?.size ?? 'default';
  const textSize = look().buttonText[size === 'sm' ? 0 : 1];
  return <Button
    className={`flex-row items-center justify-center transition-colors ${sizeClass(size)} ${surfaceClass(variant, theme())} ${props?.className ?? ''}`}
    onClick={() => { const handler = props?.onClick; if (handler !== undefined) handler(); }}>
    <Show when={props?.label !== undefined}>
      <Text className={`${textSize} text-${labelColor(variant, theme())}`}>{props?.label ?? ''}</Text>
    </Show>
    {renderSlot(props?.children)}
  </Button>;
}
