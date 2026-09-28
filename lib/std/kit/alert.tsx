/** @jsxHelpers ./host */
// zinc:ui/kit — Alert: a bordered callout with a title and a description. Variants default, destructive, success.
//
//   <Alert title="Heads up!" description="The broker is not reachable; retrying every 5 s." variant="destructive" />
import { theme, Theme } from './theme';

export interface AlertProps {
  title: string;
  description?: string;
  variant?: string;   // 'default' | 'destructive' | 'success'
  icon?: string;      // one glyph shown on the left ('!', 'i', '✓')
  class?: string;
}

function accentColor(variant: string, t: Theme): string {
  if (variant === 'destructive') return t.destructive;
  if (variant === 'success') return t.success;
  return t.foreground;
}

function defaultIcon(variant: string): string {
  if (variant === 'destructive') return '!';
  if (variant === 'success') return '✓';
  return 'i';
}

export function Alert(props: AlertProps): i32 {
  const variant = props.variant ?? 'default';
  return <View class={`flex-row gap-3 p-4 rounded-lg border border-${theme().border} bg-${theme().card} ${props.class ?? ''}`}>
    <View class={`w-5 h-5 rounded-full items-center justify-center border border-${accentColor(variant, theme())}`}>
      <Text class={`text-xs font-bold text-${accentColor(variant, theme())}`}>{props.icon ?? defaultIcon(variant)}</Text>
    </View>
    <View class="flex-col gap-1 grow">
      <Text class={`text-sm font-medium text-${accentColor(variant, theme())}`}>{props.title}</Text>
      <Show when={props.description !== undefined}>
        <Text class={`text-sm text-${theme().mutedForeground}`}>{props.description ?? ''}</Text>
      </Show>
    </View>
  </View>;
}
