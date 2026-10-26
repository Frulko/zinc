// Info: the hub's and the engine's versions, the tablet (model, system, uptime), its battery and the Marker's, memory and storage.
import { SECTION, TITLE, LABEL } from '../constants';
import { info, refreshInfo } from '../state';
import { InfoSection, InfoLine } from '../services/system';
import { OutlineButton } from '../components/buttons';

function Section(props: { s: InfoSection }): i32 {
  return <View className="flex-col gap-3 py-6 border-b-2 border-black">
    <Text className={TITLE}>{props.s.title}</Text>
    {props.s.lines.map((l: InfoLine) => <View className="flex-row gap-6">
      <Text className={`w-[300px] ${LABEL}`}>{l.label}</Text>
      <Text className={`grow font-bold ${LABEL}`}>{l.value}</Text>
    </View>)}
  </View>;
}

export function InfoPage(): i32 {
  return <View className={`${SECTION} grow`}>
    <View className="flex-row justify-between items-center">
      <Text className={TITLE}>Info</Text>
      <OutlineButton label="Read again" onClick={() => { refreshInfo(); }} />
    </View>
    <ScrollView className="grow">
      <View className="flex-col">{info().map((s: InfoSection) => <Section s={s} />)}</View>
    </ScrollView>
  </View>;
}
