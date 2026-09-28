// A card for one module: a title, the module name as a badge, and the live content.
import { Card, CardContent, Badge, CardTitle } from 'zinc:ui/kit';

export interface ModuleCardProps {
  title: string;
  module: string;
  children: () => i32;
}

export function ModuleCard(props: ModuleCardProps): i32 {
  return <Card class="w-[360px]">
    <View class="flex-row items-center justify-between gap-2 px-5">
      <CardTitle text={props.title} />
      <Badge label={props.module} variant="secondary" />
    </View>
    <CardContent>{props.children()}</CardContent>
  </Card>;
}
