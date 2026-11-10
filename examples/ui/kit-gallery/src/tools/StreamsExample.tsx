/** @jsxHelpers zinc:ui/kit/host */
import { LogConsole, LogBuffer, Terminal, TerminalBuffer, Button, heading, theme } from 'zinc:ui/kit';
import { componentRef, componentSignal } from 'zinc:ui/kit/host';
class Streams {
  log = new LogBuffer(2000, 262144);
  terminal = new TerminalBuffer();
  sequence = 0;
  constructor() {
    this.log.append('Connected to studio interface', 'info', 'audio', '10:42:01');
    this.log.append('Input 2 is muted', 'warning', 'mixer', '10:42:02');
    this.terminal.write(
      'Zinc terminal · caller-owned commands\n\u001b[32mReady\u001b[0m. Try help, status, clear, or an unknown command.\n',
    );
  }
}
export function StreamsExample(): i32 {
  const state = componentRef(new Streams()).current,
    [revision, setRevision] = componentSignal(0);
  const changed = (): void => setRevision(revision() + 1);
  const command = (value: string): void => {
    if (value === 'clear') state.terminal.clear();
    else if (value === 'help') state.terminal.write('help  status  clear\n');
    else if (value === 'status') state.terminal.write('\u001b[38;5;35m2 channels online\u001b[0m\n');
    else if (value.trim() !== '') state.terminal.write('\u001b[31mUnknown command: ' + value + '\u001b[0m\n');
    changed();
  };
  return (
    <View className="flex-col gap-6 min-w-0">
      <Text className={heading(3)}>Logs and terminal</Text>
      <Button
        label="Append a log record"
        variant="outline"
        onClick={() => {
          state.log.append(
            'Buffer ' + String(++state.sequence) + ' processed',
            state.sequence % 3 === 0 ? 'warning' : 'info',
            'audio',
            '10:42:03',
          );
          changed();
        }}
      />
      <LogConsole buffer={state.log} revision={revision} height={170} />
      <Terminal
        buffer={state.terminal}
        revision={revision}
        onCommand={command}
        onInterrupt={() => {
          changed();
        }}
        height={160}
      />
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>
        Shift-click output lines to select a range. Up/Down recall commands; Ctrl+C interrupts.
      </Text>
    </View>
  );
}
