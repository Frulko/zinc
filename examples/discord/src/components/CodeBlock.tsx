// A code block of a message: its language and a copy button over its text, highlighted by zinc:editor's read-only CodeView. The one
// place a code block is drawn.
import { useState } from 'zinc:ui/react';
import { Icon } from 'zinc:icons';
import { CodeView } from 'zinc:editor';
import { setClipboardText } from 'zinc:gfx';
import { BG_SIDE, BG_HOVER, TEXT_MAIN, TEXT_MUTED } from '../constants';
import { color, rounded } from '../theme';

const COPIED_MS = 1500;

export function CodeBlock(p: { code: string; lang: string }) {
  const [copied, setCopied] = useState<boolean>(false);
  const copy = (): void => { setClipboardText(p.code); setCopied(true); setTimeout(() => { setCopied(false); }, COPIED_MS); };
  return <View className={`my-1 ${rounded()} border border-[var(--dc-border)] ${BG_SIDE}`}>
    <View className="h-[24] pl-3 pr-1 flex-row items-center">
      <Text className={`grow text-[11px] ${TEXT_MUTED}`}>{p.lang}</Text>
      <View className={`h-[20] px-1.5 flex-row items-center gap-1 rounded ${BG_HOVER}`} aria-label="Copy code" onPress={copy}>
        <Icon name={copied ? 'check' : 'copy'} size={12} color={() => color('muted')} />
        <Text className={`text-[11px] ${TEXT_MUTED}`}>{copied ? 'Copied' : 'Copy'}</Text>
      </View>
    </View>
    <CodeView code={p.code} lang={p.lang} className={`px-3 pb-2 text-[13px] leading-[18] ${TEXT_MAIN}`} />
  </View>;
}
