// A small labelled button that shows whether it is the active choice (the tool, the brush, the onion skin...).
export interface ChipProps { label: string; active: () => boolean; onPress: () => void }

export function Chip(p: ChipProps): i32 {
  return <Button onClick={p.onPress} aria-label={p.label}
    className={`h-[30] grow basis-0 px-2 items-center justify-center rounded-[6] ${p.active() ? 'bg-[#4b6cff]' : 'bg-[#323743] hover:bg-[#3c4250]'}`}>
    <Text className={`text-[12px] ${p.active() ? 'text-white' : 'text-[#c9d1dc]'}`}>{p.label}</Text>
  </Button>;
}
