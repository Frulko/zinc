import { theme } from 'zinc:ui/kit';
import { call } from './call';
import { GaleneStream } from './galene';
import GaleneTile from './GaleneTile';

export default function GaleneGrid() {
  const client = call.galene, tiles = client.downStreams();
  return <ScrollView className={`flex-1 bg-${theme().background}`}>
    <View className="flex-row flex-wrap gap-4 p-4">
      {tiles.map((stream: GaleneStream) => <GaleneTile client={client} stream={stream} showStats={call.showStats} />)}
      {tiles.length === 0 && <Text className={`text-[13px] text-${theme().mutedForeground}`}>{client.why !== '' ? client.why : 'The other participants appear here when they publish media.'}</Text>}
    </View>
  </ScrollView>;
}
