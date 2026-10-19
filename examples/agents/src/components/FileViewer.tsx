// A configuration file or folder, read-only, in place of the chat.
import * as fs from 'zinc:fs';
import { ConfigFile } from '../services/discovery';
import { viewFile } from '../state';
import { BACKGROUND, BORDER, TEXT, MUTED, FAINT, SURFACE_HOVER, bg, fg, bd } from '../theme';

/** A larger file shows its beginning: the viewer is for reading settings, not logs. */
const MAX_SHOWN_BYTES = 200 * 1024;

function contentOf(f: ConfigFile): string {
  try {
    if (f.isDirectory) return fs.list(f.path).sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0).join('\n');
    const text = fs.readText(f.path);
    return text.length > MAX_SHOWN_BYTES ? text.slice(0, MAX_SHOWN_BYTES) + '\n…' : text;
  } catch (e) {
    return `cannot read ${f.path}: ${e.message}`;
  }
}

export function FileViewer(props: { file: ConfigFile }): i32 {
  return <View className="grow flex-col">
    <View className={`flex-row items-center gap-3 h-[44] px-4 border-b ${bd(BORDER)}`}>
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`}>{props.file.label}</Text>
      <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(FAINT)}`}>{props.file.path}</Text>
      <View className={`h-[26] px-3 rounded-md items-center justify-center cursor-pointer hover:${bg(SURFACE_HOVER)}`} onPress={() => viewFile(null)}>
        <Text className={`text-[12px] ${fg(MUTED)}`}>Back to the chat</Text>
      </View>
    </View>
    <TextArea readOnly wrap={false} className={`grow font-mono text-[12px] p-3 ${bg(BACKGROUND)} ${fg(TEXT)}`} value={contentOf(props.file)} />
  </View>;
}
