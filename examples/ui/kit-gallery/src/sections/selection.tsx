import { createSignal } from 'zinc:ui/solid';
import { Checkbox, Switch, RadioGroup, RadioCards, Slider, RangeSlider, Chip, Chips, Rating, heading, theme } from 'zinc:ui/kit';
const [accepted, setAccepted] = createSignal(true);
const [mixed, setMixed] = createSignal(true);
const [notify, setNotify] = createSignal(true);
const [delivery, setDelivery] = createSignal('standard');
const [plan, setPlan] = createSignal('studio');
const [volume, setVolume] = createSignal(45);
const [gain, setGain] = createSignal(10);
const [low, setLow] = createSignal(25);
const [high, setHigh] = createSignal(75);
const [tags, setTags] = createSignal<string[]>(['photos']);
const [chip, setChip] = createSignal(true);
const [removed, setRemoved] = createSignal(false);
const [rating, setRating] = createSignal(3);
export function SelectionSection(): i32 {
  return <View className="flex-col gap-6">
    <Text className={heading(2)}>Selection</Text>
    <View className="flex-row flex-wrap gap-6 items-start">
      <View className="flex-col gap-4">
        <Checkbox label="Keep a local copy" checked={accepted} onChange={setAccepted} description="Available without a connection" />
        <Checkbox label="Project folders" checked={() => false} indeterminate={mixed} onChange={(on: boolean) => setMixed(false)} />
        <Checkbox label="Managed by your team" checked={() => true} onChange={(on: boolean) => {}} disabled={true} />
        <Switch label="Notify me immediately" checked={notify} onChange={setNotify} />
        <Switch label="Managed switch" checked={() => false} onChange={(on: boolean) => {}} disabled={true} />
      </View>
      <RadioGroup label="Delivery" value={delivery} onChange={setDelivery} items={[{ value: 'standard', label: 'Standard delivery' }, { value: 'express', label: 'Express delivery' }, { value: 'courier', label: 'Courier unavailable', disabled: true }]} />
    </View>
    <RadioCards label="Workspace plan" value={plan} onChange={setPlan} items={[{ value: 'personal', label: 'Personal', description: 'One person, local projects', icon: 'user' }, { value: 'studio', label: 'Studio', description: 'Shared projects for your team', icon: 'users', badge: 'Current plan' }]} />
    <View className="flex-row items-start gap-8">
      <View className="flex-col gap-4 w-[340px]">
        <Text className={`text-[13px] text-${theme().foreground}`}>Volume</Text>
        <Slider accessibilityLabel="Volume" value={volume} onChange={setVolume} step={5} showValue={true} markers={[0, 50, 100]} format={(value: number) => String(Math.round(value)) + ' %'} />
        <Text className={`text-[13px] text-${theme().foreground}`}>Histogram range</Text>
        <RangeSlider accessibilityLabel="Histogram" low={low} high={high} onChange={(lo: number, hi: number) => { setLow(lo); setHigh(hi); }} showValue={true} />
        <Slider accessibilityLabel="Locked volume" value={() => 60} onChange={(value: number) => {}} disabled={true} />
      </View>
      <View className="flex-col gap-3"><Text className={`text-[13px] text-${theme().foreground}`}>Logarithmic gain</Text><Slider accessibilityLabel="Gain" value={gain} onChange={setGain} min={1} max={1000} step={1} vertical={true} logarithmic={true} showValue={true} /></View>
    </View>
    <View className="flex-row gap-4 items-center">
      <Chips label="Include media" value={tags} onChange={setTags} items={[{ value: 'photos', label: 'Photos' }, { value: 'audio', label: 'Audio' }, { value: 'video', label: 'Video', disabled: true }]} />
      <Show when={!removed()}><Chip label="Draft" selected={chip} onChange={setChip} onRemove={() => setRemoved(true)} /></Show>
    </View>
    <View className="flex-row items-center gap-4"><Rating label="Project rating" value={rating} onChange={setRating} /><Text role="status" className={`text-[13px] text-${theme().mutedForeground}`}>{String(rating()) + ' of 5 · click again or Delete to clear'}</Text></View>
  </View>;
}
