/** @jsxHelpers ./host */
// zinc:ui/kit — Badge: a small status pill. Variants default, secondary, outline, destructive, plus the tinted
// success, warning and accent that dashboards need.
//
//   <Badge label="Online" variant="success" />
import { theme, Theme } from './theme';

export interface BadgeProps {
  label: string;
  variant?: string;   // 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'accent'
  class?: string;
}

/** Fill (and border) of a variant. */
function fillClass(variant: string, t: Theme): string {
  if (variant === 'secondary') return `bg-${t.secondary}`;
  if (variant === 'outline') return `border border-${t.border}`;
  if (variant === 'destructive') return `bg-${t.destructiveSoft}`;
  if (variant === 'success') return `bg-${t.successSoft}`;
  if (variant === 'warning') return `bg-${t.warningSoft}`;
  if (variant === 'accent') return `bg-${t.accentSoft}`;
  return `bg-${t.primary}`;
}

/** Text colour of a variant (text does not inherit colour from its View). */
function textColor(variant: string, t: Theme): string {
  if (variant === 'secondary') return t.secondaryForeground;
  if (variant === 'outline') return t.foreground;
  if (variant === 'destructive') return t.destructiveSoftForeground;
  if (variant === 'success') return t.successSoftForeground;
  if (variant === 'warning') return t.warningSoftForeground;
  if (variant === 'accent') return t.accentSoftForeground;
  return t.primaryForeground;
}

export function Badge(props: BadgeProps): i32 {
  const variant = props.variant ?? 'default';
  return <View class={`flex-row items-center px-2 py-0.5 rounded-md ${fillClass(variant, theme())} ${props.class ?? ''}`}>
    <Text class={`text-xs font-semibold text-${textColor(variant, theme())}`}>{props.label}</Text>
  </View>;
}
