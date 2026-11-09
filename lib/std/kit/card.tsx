/** @jsxHelpers zinc:ui/kit/host */
// zinc:ui/kit — Card and its sections, after shadcn/ui's: a white surface with a hairline border and a soft shadow.
// The card spaces its sections; each section pads itself horizontally.
//
//   <Card className="w-80">
//     <CardHeader title="Create project" description="Deploy your new project in one click." />
//     <CardContent>...</CardContent>
//     <CardFooter><Button label="Deploy" /></CardFooter>
//   </Card>
import { theme } from './theme';
import { renderSlot } from './host';
import { look } from '../platform/index';
import * as ui from 'zinc:ui';

export interface CardProps {
  className?: string;         // size and placement ('w-80', 'grow')
  children?: () => i32;
  selected?: () => boolean;
  muted?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
export interface CardHeaderProps {
  title?: string;
  description?: string;
  children?: () => i32;   // extra header content (a badge, an action) under the title
}
export interface CardTextProps { text: string }
export interface CardSectionProps {
  className?: string;
  children?: () => i32;
}

/** The inner padding of a card and its sections, in Tailwind steps: 20 px, 24 under Quiet. */
function inset(): i32 { return look().name === 'quiet' ? 6 : 5; }

export function Card(props: CardProps = {}): i32 {
  const node = <View role={props.onClick !== undefined ? 'button' : 'group'} aria-pressed={props.onClick !== undefined && props.selected !== undefined ? String(props.selected()) : ''} disabled={props.disabled === true}
    className={`flex-col gap-4 py-${inset()} ${look().card} border border-${props.selected !== undefined && props.selected() ? theme().accent : theme().border} bg-${props.muted === true ? theme().muted : theme().card} focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2 ${props.disabled === true ? 'opacity-45' : ''} ${props.className ?? ''}`}>
    {renderSlot(props.children)}
  </View>;
  if (props.onClick !== undefined) ui.listen(node, () => { if (props.disabled !== true) props.onClick?.(); });
  return node;
}

export function CardTitle(props: CardTextProps): i32 {
  const size = look().name === 'quiet' ? look().lead + ' font-medium' : 'text-base font-semibold tracking-tight';   // Quiet: 15 px medium (sizes come from the look, not literals: docs/ui-kit.md, what a component costs)
  return <Text as="h3" className={`${size} text-${theme().foreground}`}>{props.text}</Text>;
}

export function CardDescription(props: CardTextProps): i32 {
  return <Text className={`${look().name === 'quiet' ? look().small : 'text-sm'} text-${theme().mutedForeground}`}>{props.text}</Text>;
}

export function CardHeader(props?: CardHeaderProps): i32 {
  return <View className={`flex-col gap-1 px-${inset()}`}>
    <Show when={props?.title !== undefined}><CardTitle text={props?.title ?? ''} /></Show>
    <Show when={props?.description !== undefined}><CardDescription text={props?.description ?? ''} /></Show>
    {renderSlot(props?.children)}
  </View>;
}

export function CardContent(props?: CardSectionProps): i32 {
  return <View className={`flex-col gap-3 px-${inset()} ${props?.className ?? ''}`}>{renderSlot(props?.children)}</View>;
}

export function CardFooter(props?: CardSectionProps): i32 {
  return <View className={`flex-row items-center gap-2 px-${inset()} ${props?.className ?? ''}`}>{renderSlot(props?.children)}</View>;
}
