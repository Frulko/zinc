import { createSignal } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { CodeBlock, CodeEditor, DiffViewer, MarkdownView, JsonViewer, heading, captionText } from 'zinc:ui/kit';
const SAMPLE = 'interface Workshop {\n  name: string;\n  seats: number;\n}\n\nconst workshop: Workshop = {\n  name: "Paper circuits",\n  seats: 12,\n};';
export function CodeSection(): i32 {
  const [code, setCode] = createSignal(SAMPLE);
  const [markdown, setMarkdown] = createSignal('# Paper circuits\n\nMake a greeting card that lights up. Bring **paper**, copper tape and a `CR2032` cell.\n\n- [x] Choose a design\n- [ ] Connect the LED\n\nRead the [Zinc guide](https://zinc.dev).\n\n| Material | Quantity |\n| --- | --- |\n| LEDs | 12 |\n| Copper tape | 2 rolls |\n\n```ts\nconst seats = 12;\n```');
  const [status, setStatus] = createSignal('Links and tasks work with Enter or Space.');
  const visible = (name: string): boolean => env('CODE_VIEW') === '' || env('CODE_VIEW') === name;
  return <View className="flex-col gap-6">
    <Text className={heading(3)}>Code</Text>
    <Show when={visible('block')}><View className="flex-col gap-3"><Text className={heading(4)}>Code block</Text>
      <CodeBlock code={SAMPLE} language="ts" title="workshop.ts" lineNumbers={true} emphasizedLines={[6, 7, 8]} />
    </View></Show>
    <Show when={visible('editor')}><View className="flex-col gap-3"><Text className={heading(4)}>Code editor</Text>
      <CodeEditor label="Workshop source" title="workshop.ts" value={code} onChange={setCode} language="ts" height={240} indent="  " />
      <Text className={captionText()}>Find: Command/Ctrl F · Go to line: Command/Ctrl G · Next match: F3</Text>
      <CodeEditor label="Read-only preview" value={() => code()} onChange={(value: string) => {}} language="ts" readOnly={true} height={100} />
    </View></Show>
    <Show when={visible('diff')}><View className="flex-col gap-3"><Text className={heading(4)}>Diff viewer</Text>
      <DiffViewer before={SAMPLE} after={SAMPLE.replace('seats: 12', 'seats: 16').replace('Paper circuits', 'LED postcards')} language="ts" title="Workshop revision" height={300} context={2} />
      <Text className={captionText()}>Split view becomes inline below 560 px. F7 moves between changes; Shift F7 goes back.</Text>
    </View></Show>
    <Show when={visible('markdown')}><View className="flex-col gap-3"><Text className={heading(4)}>Markdown</Text>
      <MarkdownView source={markdown()} onLink={(href: string) => setStatus('Selected link: ' + href)} onTask={(source: string, offset: i32, checked: boolean) => { setMarkdown(source); setStatus(checked ? 'Task completed' : 'Task reopened'); }} />
      <Text role="status" className={captionText()}>{status()}</Text>
    </View></Show>
    <Show when={visible('json')}><View className="flex-col gap-3"><Text className={heading(4)}>JSON viewer</Text>
      <JsonViewer source={'{"workshop":{"name":"Paper circuits","seats":12,"materials":["LEDs","copper tape","paper"]},"ready":true,"a/b":{"~key":null},"":[] }'} label="Workshop data" height={340} expandDepth={2} />
      <View className="flex-row flex-wrap gap-3"><View className="grow min-w-[220px]"><JsonViewer source="42" label="Primitive root" height={50} /></View><View className="grow min-w-[220px]"><JsonViewer source="{" label="Invalid document" height={50} /></View></View>
      <Text className={captionText()}>Arrows navigate and fold; Home/End jump; Enter or Space toggles. Each tree keeps its own folds.</Text>
    </View></Show>
  </View>;
}
