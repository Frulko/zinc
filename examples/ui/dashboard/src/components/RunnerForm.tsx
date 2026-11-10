import { createSignal } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, Tabs, Input, PasswordField, Button, theme } from 'zinc:ui/kit';
import { Runner } from '../data';
export function RunnerForm(): i32 {
  const platforms = ['Linux', 'macOS'];
  const [platform, setPlatform] = createSignal<i32>(0);
  const [name, setName] = createSignal('studio-linux-02');
  const [token, setToken] = createSignal('demo-token-only');
  const [runners, setRunners] = createSignal<Runner[]>([{ name: 'studio-mac-01', platform: 'macOS' }]);
  const [notice, setNotice] = createSignal('Use any demo token of at least 8 characters.');
  const addRunner = (): void => {
    const value = name().trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,31}$/.test(value)) { setNotice('Use 2–32 letters, digits or hyphens for the name.'); return; }
    if (token().trim().length < 8) { setNotice('The demo token needs at least 8 characters.'); return; }
    if (runners().some((runner: Runner) => runner.name.toLowerCase() === value.toLowerCase())) { setNotice('A runner with this name already exists.'); return; }
    setRunners(runners().concat([{ name: value, platform: platforms[platform()] }]));
    setToken('');
    setNotice('Added ' + value + ' locally. No connection was opened.');
  };
  return <Card><CardHeader title="Add a runner" description="Practice a registration with fictional credentials." />
    <CardContent className="gap-4">
      <Tabs label="Runner platform" items={platforms} selected={platform} onSelect={setPlatform} />
      <Input label="Runner name" value={name} onInput={setName} onSubmit={addRunner} />
      <PasswordField label="Demo registration token" value={token} onInput={setToken} onSubmit={addRunner} />
      <Button label="Add local runner" onClick={addRunner} />
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{notice()}</Text>
      <Text className={`text-[13px] font-medium text-${theme().foreground}`}>{String(runners().length) + ' local runners'}</Text>
      {runners().map((runner: Runner) => <View className={`flex-row flex-wrap gap-2 items-center border-t border-${theme().border} pt-2`}>
        <View className="grow flex-col gap-1"><Text className={`text-[13px] text-${theme().foreground}`}>{runner.name}</Text><Text className={`text-[12px] text-${theme().mutedForeground}`}>{runner.platform}</Text></View>
        <Button label="Remove" ariaLabel={'Remove ' + runner.name} size="sm" variant="ghost" onClick={() => { setRunners(runners().filter((item: Runner) => item.name !== runner.name)); setNotice('Removed ' + runner.name); }} />
      </View>)}
    </CardContent>
  </Card>;
}
