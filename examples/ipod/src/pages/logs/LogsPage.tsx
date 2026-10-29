// The log: every operation of the session, newest first (time, what, result; errors in red), and the file it is appended to.
import { VirtualList } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { logEntries, logFile, LogEntry } from '../../services/log';
import { bd, bg, fg, color, BORDER, STRIPE, TEXT, MUTED, FAINT, ERROR, ACCENT, ROW_HEIGHT } from '../../constants';

const NO_ENTRY = new LogEntry('', '', '', true);

export function LogsPage(): i32 {
  const at = (i: i32): LogEntry => { const l = logEntries(); return i < l.length ? l[i] : NO_ENTRY; };
  return <View className="grow flex-col min-h-0">
    <View className="flex-col px-10 pt-8 pb-4">
      <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Logs</Text>
      <Text className={`text-[13px] ${fg(MUTED)}`} numberOfLines={1}>{`Every operation of this session, also appended to ${logFile()}`}</Text>
    </View>
    <View className={`flex-row items-center h-[30] px-6 gap-4 border-b ${bd(BORDER)}`}>
      <Text className={`w-[150] text-[12px] font-semibold ${fg(MUTED)}`}>Time</Text>
      <Text className={`w-[300] text-[12px] font-semibold ${fg(MUTED)}`}>Operation</Text>
      <Text className={`grow basis-0 text-[12px] font-semibold ${fg(MUTED)}`}>Result</Text>
    </View>
    {logEntries().length === 0 ? <Text className={`text-[13px] px-10 pt-4 ${fg(MUTED)}`}>Nothing yet</Text> : <View />}
    <VirtualList count={logEntries().length} itemHeight={ROW_HEIGHT} className="grow min-h-0">
      {(i: i32) => <View className={`flex-row items-center px-6 gap-4 ${i % 2 === 1 ? bg(STRIPE) : ''}`} style={{ height: ROW_HEIGHT }}>
        <Text className={`w-[150] text-[12px] ${fg(FAINT)}`}>{at(i).time}</Text>
        <View className="flex-row items-center gap-2 w-[300]">
          <Icon name={at(i).ok ? 'circle-check' : 'circle-x'} size={13} color={() => color(at(i).ok ? ACCENT : ERROR)} strokeWidth={2} />
          <Text className={`grow basis-0 text-[13px] ${fg(TEXT)}`} numberOfLines={1}>{at(i).what}</Text>
        </View>
        <Text className={`grow basis-0 text-[12px] ${at(i).ok ? fg(MUTED) : fg(ERROR)}`} numberOfLines={1}>{at(i).result}</Text>
      </View>}
    </VirtualList>
  </View>;
}
