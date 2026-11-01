import { For } from 'zinc:ui/solid';
import { Clue } from '../clues';
import { puzzle } from '../state';
export function SceneClues(): i32 {
 return <View className="w-full gap-2"><For each={puzzle().clues.filter((c: Clue) => c.person < 0)}>{(c: Clue) => <View className="px-3 py-2 bg-[#ffffff] rounded-[8] border border-[#dedee4]"><Text className="text-[12px] text-[#50515a]">{c.text}</Text></View>}</For></View>;
}
