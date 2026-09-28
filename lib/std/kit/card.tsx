/** @jsxHelpers ./host */
// zinc:ui/kit — Card and its sections, after shadcn/ui's: a white surface with a hairline border and a soft shadow.
// The card spaces its sections; each section pads itself horizontally.
//
//   <Card class="w-80">
//     <CardHeader title="Create project" description="Deploy your new project in one click." />
//     <CardContent>...</CardContent>
//     <CardFooter><Button label="Deploy" /></CardFooter>
//   </Card>
import { theme } from './theme';
import { renderSlot } from './host';

export interface CardProps {
  class?: string;         // size and placement ('w-80', 'grow')
  children?: () => i32;
}
export interface CardHeaderProps {
  title?: string;
  description?: string;
  children?: () => i32;   // extra header content (a badge, an action) under the title
}
export interface CardTextProps { text: string }
export interface CardSectionProps {
  class?: string;
  children?: () => i32;
}

export function Card(props?: CardProps): i32 {
  return <View class={`flex-col gap-4 py-5 rounded-xl border border-${theme().border} bg-${theme().card} shadow-sm ${props?.class ?? ''}`}>
    {renderSlot(props?.children)}
  </View>;
}

export function CardTitle(props: CardTextProps): i32 {
  return <Text class={`text-base font-semibold tracking-tight text-${theme().foreground}`}>{props.text}</Text>;
}

export function CardDescription(props: CardTextProps): i32 {
  return <Text class={`text-sm text-${theme().mutedForeground}`}>{props.text}</Text>;
}

export function CardHeader(props?: CardHeaderProps): i32 {
  return <View class="flex-col gap-1 px-5">
    <Show when={props?.title !== undefined}><CardTitle text={props?.title ?? ''} /></Show>
    <Show when={props?.description !== undefined}><CardDescription text={props?.description ?? ''} /></Show>
    {renderSlot(props?.children)}
  </View>;
}

export function CardContent(props?: CardSectionProps): i32 {
  return <View class={`flex-col gap-3 px-5 ${props?.class ?? ''}`}>{renderSlot(props?.children)}</View>;
}

export function CardFooter(props?: CardSectionProps): i32 {
  return <View class={`flex-row items-center gap-2 px-5 ${props?.class ?? ''}`}>{renderSlot(props?.children)}</View>;
}
