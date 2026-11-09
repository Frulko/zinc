import { Icon } from 'zinc:icons';
function defaultName(name: string = 'alarm-clock'): string { return name; }
export function ReachedDefault(): i32 { return <Icon name={defaultName()} />; }
export function UnusedDefault(): i32 { return <Icon name="apple" />; }
