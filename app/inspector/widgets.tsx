// The small controls every panel of Zinc Inspector uses: a button, a toggle (a checkbox with its label), a field, a chip.

export function Btn(p: { label: string; onClick: () => void }): i32 {
  return <Button className="py-1 flex-row items-center justify-center h-7 px-3 rounded-md bg-slate-900" onClick={p.onClick}>
    <Text className="text-xs font-medium text-white">{p.label}</Text>
  </Button>;
}

/** A small flat button, for toolbars and rows. */
export function Flat(p: { label: string; on: boolean; onClick: () => void }): i32 {
  return <Button className={'py-0.5 flex-row items-center h-6 px-2 rounded ' + (p.on ? 'bg-slate-300' : 'bg-slate-50')} onClick={p.onClick}>
    <Text className="text-xs text-slate-800">{p.label}</Text>
  </Button>;
}

/** A checkbox and its label: Chrome's toolbar toggles and the switches of a property. */
export function Toggle(p: { label: string; on: boolean; onClick: () => void }): i32 {
  return <Button className="flex-row items-center gap-1 h-6 px-1 rounded bg-white" onClick={p.onClick}>
    <View className={'w-3 h-3 rounded-sm border ' + (p.on ? 'bg-sky-600 border-sky-600' : 'bg-white border-slate-400')} />
    <Text className="text-xs text-slate-800">{p.label}</Text>
  </Button>;
}

/** A text field; `value` is read in the field (a signal's getter), so typing does not mount it again. It narrows in a pane too small for it (min-w-0). */
export function Field(p: { value: () => string; width: string; onInput: (v: string) => void; onChange: (v: string) => void }): i32 {
  return <Input className={'bg-white border-slate-300 py-1 text-slate-900 h-6 px-2 text-xs font-mono border rounded min-w-0 ' + p.width} value={p.value()}
    onInput={p.onInput} onChange={p.onChange} />;
}

/** One line of small monospaced text. */
export function Mono(p: { text: string; color: string }): i32 {
  return <Text className={'text-xs font-mono break-all ' + p.color}>{p.text}</Text>;
}
