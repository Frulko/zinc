/** @jsxHelpers zinc:ui/nuxt/host */
import { state } from './model';
let valueOf: () => i32 = () => -1;
export function nuxtValue(): i32 { return valueOf(); }
export let nuxtChange: (value: i32) => void = (value: i32) => {};
function Leaf(): i32 { const [value, change] = state<i32>(0); valueOf = value; nuxtChange = change; return <Text>{value()}</Text>; }
export function NuxtParent(): i32 { return <View><Leaf /></View>; }
