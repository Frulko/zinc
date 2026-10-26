// The Hub's widget (zinc:remarkable RemarkableApp): Accueil shows it as an AppLoad card over the tablet while the Hub keeps running. It says
// how many updates wait and which Zinc apps stopped responding, each with Stop; the card's header opens the Hub and closes it.
import { TITLE, LABEL, SMALL } from '../constants';
import { rows, engineOffer, paired, stuck, runningApps, stopRunning, status, AppRow } from '../state';
import { RunningApp } from '../services/running';
import { task, step } from '../services/progress';
import { SolidButton } from '../components/buttons';

export const WIDGET_W: i32 = 700;
export const WIDGET_H: i32 = 420;

function updatesLine(): string {
  if (!paired()) return 'Not paired: open the Hub, then Settings.';
  const names = rows().filter((r: AppRow) => r.updatable).map((r: AppRow) => r.name);
  if (engineOffer() !== '') names.push('the engine');
  return names.length === 0 ? 'Everything is up to date.' : `${names.length} update${names.length > 1 ? 's' : ''}: ${names.join(', ')}`;
}

export function HubWidget(): i32 {
  return <View className="flex-col gap-4 p-6 bg-white" style={{ width: WIDGET_W, height: WIDGET_H }}>
    <Text className={TITLE}>Zinc Hub</Text>
    <Text className={LABEL}>{updatesLine()}</Text>
    {stuck().slice(0, 2).map((a: RunningApp) => <View className="flex-row gap-4 items-center justify-between">
      <Text className={LABEL}>{`${a.name} is not responding`}</Text>
      <SolidButton label="Stop" onClick={() => { stopRunning(a.pid); }} />
    </View>)}
    {stuck().length === 0 ? <Text className={SMALL}>{runningApps().length === 0 ? 'No Zinc app is running.' : `Running: ${runningApps().map((a: RunningApp) => a.name).join(', ')}`}</Text> : null}
    <Text className={SMALL}>{task() !== '' ? `${task()}: ${step()}` : status()}</Text>
  </View>;
}
