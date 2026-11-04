// The files on their way to the mapper. Closing it leaves them going: the bottom bar follows them too.
import { Button, Dialog, Progress } from 'zinc:ui/kit';
import { For } from 'zinc:ui/solid';
import { DONE, FAILED, Transfer, setTransferOpen, transferOpen, transfers } from '../transfers';
import { tr, trn } from '../i18n';

function detail(transfer: Transfer): string {
  if (transfer.state === FAILED) return transfer.problem;
  return transfer.state === DONE ? tr('mapper.transfer.done') : transfer.part > 0 ? `${Math.round(transfer.part * 100)}%` : tr(`mapper.transfer.${transfer.state}`);
}

export function TransferRow(props: { transfer: Transfer }): i32 {
  const transfer = props.transfer;
  const live = (): Transfer => { transfers(); return transfer; };   // the list keeps its objects: the signal says one of them changed
  return <View className="gap-1">
    <View className="flex-row gap-2">
      <Text className="w-0 grow text-xs text-zinc-100" numberOfLines={1}>{transfer.name}</Text>
      <Text className={`text-xs ${live().state === FAILED ? 'text-red-400' : 'text-zinc-400'}`} numberOfLines={1}>{detail(live())}</Text>
    </View>
    <Progress value={() => live().part * 100} />
  </View>;
}

function overall(): string {
  const all = transfers();
  const done = all.filter((t: Transfer): boolean => t.state === DONE).length;
  return trn('mapper.transfer.overall', all.length, ['done', `${done}`]);
}

export function TransferDialog(): i32 {
  return <Dialog open={transferOpen} onOpenChange={setTransferOpen} title={tr('mapper.transfer.title')} description={tr('mapper.transfer.description')} className="w-[480]"
    footer={() => <Button label={tr('mapper.transfer.close')} onClick={() => setTransferOpen(false)} />}>
    <View className="gap-3">
      <Text className="text-xs text-zinc-300">{overall()}</Text>
      <ScrollView className="max-h-[320] gap-3">
        <For each={transfers()}>{(transfer: Transfer) => <TransferRow transfer={transfer} />}</For>
      </ScrollView>
    </View>
  </Dialog>;
}
