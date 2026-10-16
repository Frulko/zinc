import { Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/solid/components";
import { onMount } from "@pocketjs/framework/solid/lifecycle";
import { createHero, type HeroViewProps } from "./Hero";

export default function HeroView(props: HeroViewProps) {
  const { count, spinnerFrame, underlineOffset, underline, mountHero, press } = createHero(
    props.compact ? 160 : props.largeLayout ? 315 : 210,
    props.largeLayout && !props.compact ? 3 : 2,
    props.spinnerDelay,
  );
  onMount(() => mountHero());
  return (
    <View
      debugName="HeroScreen"
      className={props.compact
        ? "w-full h-full flex-col justify-between p-3 bg-gradient-to-b from-slate-50 to-slate-100"
        : props.largeLayout
          ? "w-full h-full flex-col justify-between p-[30] bg-gradient-to-b from-slate-50 to-slate-100"
          : "w-full h-full flex-col justify-between p-5 bg-gradient-to-b from-slate-50 to-slate-100"}
    >
      <View debugName="Header" className="flex-row flex-wrap items-center justify-between">
        <View className={props.compact ? "flex-row items-center gap-2" : props.largeLayout ? "flex-row items-center gap-[18]" : "flex-row items-center gap-3"}>
          <Image className={props.compact ? "w-7 h-7 rounded-md" : props.largeLayout ? "w-[60] h-[60] rounded-xl shadow" : "w-10 h-10 rounded-lg shadow"} src="logo.png" />
          <View className="flex-col">
            <Text className={props.compact ? "text-sm text-slate-950 font-bold" : props.largeLayout ? "text-2xl text-slate-950 font-bold tracking-wide" : "text-base text-slate-950 font-bold tracking-wide"}>PocketJS</Text>
            <Text className={props.largeLayout && !props.compact ? "text-lg text-slate-500 tracking-wide" : "text-xs text-slate-500 tracking-wide"}>
              {props.compact ? props.runtimeLabel : `Solid + ${props.runtimeLabel}`}
            </Text>
          </View>
        </View>
        <Show when={!props.compact} fallback={
          <View className="px-2 py-1 rounded-md bg-blue-100">
            <Text className="text-xs text-blue-700 font-bold">{props.presentationHz} FPS</Text>
          </View>
        }>
          <View className={props.largeLayout ? "flex-row gap-6" : "flex-row gap-4"}>
            <View className="flex-col items-end">
              <Text className={props.largeLayout ? "text-2xl text-emerald-600 font-bold" : "text-lg text-emerald-600 font-bold"}>{props.presentationHz}</Text>
              <Text className={props.largeLayout ? "text-lg text-slate-500 tracking-wide" : "text-xs text-slate-500 tracking-wide"}>FPS</Text>
            </View>
            <View className="flex-col items-end">
              <Text className={props.largeLayout ? "text-2xl text-blue-600 font-bold" : "text-lg text-blue-600 font-bold"}>42</Text>
              <Text className={props.largeLayout ? "text-lg text-slate-500 tracking-wide" : "text-xs text-slate-500 tracking-wide"}>NODES</Text>
            </View>
            <View className="flex-col items-end">
              <Text className={props.largeLayout ? "text-2xl text-amber-600 font-bold" : "text-lg text-amber-600 font-bold"}>9</Text>
              <Text className={props.largeLayout ? "text-lg text-slate-500 tracking-wide" : "text-xs text-slate-500 tracking-wide"}>DRAWS</Text>
            </View>
          </View>
        </Show>
      </View>

      <View className={props.compact ? "flex-col gap-1" : props.largeLayout ? "flex-col gap-3" : "flex-col gap-2"}>
        <Text className={props.largeLayout && !props.compact ? "text-lg text-blue-600 tracking-wide" : "text-xs text-blue-600 tracking-wide"}>
          {props.compact ? "ONE APP. NATIVE CODE." : "ONE RUST CORE · ONE JSX APP"}
        </Text>
        <View className="flex-row flex-wrap items-center justify-between">
          <Text className={props.compact ? "text-2xl text-slate-950 font-bold" : props.largeLayout ? "text-5xl text-slate-950 font-bold" : "text-4xl text-slate-950 font-bold"}>{props.headline}</Text>
          <View debugName="Spinner" className={props.compact ? "w-7 h-7" : props.largeLayout ? "w-[60] h-[60]" : "w-10 h-10"}>
            <View className="absolute top-0 left-0 w-full h-full" style={{ opacity: spinnerFrame() === 0 ? 1 : 0 }}><Image className="w-full h-full" src="spinner-00.svg" /></View>
            <View className="absolute top-0 left-0 w-full h-full" style={{ opacity: spinnerFrame() === 1 ? 1 : 0 }}><Image className="w-full h-full" src="spinner-01.svg" /></View>
            <View className="absolute top-0 left-0 w-full h-full" style={{ opacity: spinnerFrame() === 2 ? 1 : 0 }}><Image className="w-full h-full" src="spinner-02.svg" /></View>
            <View className="absolute top-0 left-0 w-full h-full" style={{ opacity: spinnerFrame() === 3 ? 1 : 0 }}><Image className="w-full h-full" src="spinner-03.svg" /></View>
            <View className="absolute top-0 left-0 w-full h-full" style={{ opacity: spinnerFrame() === 4 ? 1 : 0 }}><Image className="w-full h-full" src="spinner-04.svg" /></View>
            <View className="absolute top-0 left-0 w-full h-full" style={{ opacity: spinnerFrame() === 5 ? 1 : 0 }}><Image className="w-full h-full" src="spinner-05.svg" /></View>
            <View className="absolute top-0 left-0 w-full h-full" style={{ opacity: spinnerFrame() === 6 ? 1 : 0 }}><Image className="w-full h-full" src="spinner-06.svg" /></View>
            <View className="absolute top-0 left-0 w-full h-full" style={{ opacity: spinnerFrame() === 7 ? 1 : 0 }}><Image className="w-full h-full" src="spinner-07.svg" /></View>
          </View>
        </View>
        <View
          debugName="Underline"
          ref={underline}
          className={props.compact ? "h-1 w-0 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" : props.largeLayout ? "h-[6] w-0 rounded-full shadow bg-gradient-to-r from-blue-500 to-cyan-500" : "h-1 w-0 rounded-full shadow bg-gradient-to-r from-blue-500 to-cyan-500"}
          style={{ translateX: underlineOffset() }}
        />
        <View debugName="Description" className="flex-row flex-wrap gap-1" style={{ gap: props.largeLayout && !props.compact ? 6 : 4 }}>
          <Show when={!props.compact}>
            <Text className={props.largeLayout ? "text-xl text-slate-600" : "text-sm text-slate-600"}>Flexbox, springs and baked type —</Text>
          </Show>
          <Text className={props.compact ? "text-xs text-slate-600" : props.largeLayout ? "text-xl text-slate-600" : "text-sm text-slate-600"}>{props.deviceLabel}</Text>
        </View>
      </View>

      <View className={props.compact ? "flex-col gap-1" : "flex-row flex-wrap items-center gap-4"} style={{ gap: props.compact ? 4 : props.largeLayout ? 24 : 16 }}>
        <View className={props.compact ? "flex-row items-center justify-between" : "flex-row items-center gap-4"} style={{ gap: props.largeLayout && !props.compact ? 24 : 16 }}>
          <View
            debugName="HeroButton"
            className={props.compact
              ? "px-3 py-2 rounded-lg bg-blue-600 focus:bg-blue-500 active:bg-blue-700"
              : props.largeLayout
                ? "px-6 py-3 rounded-[18px] shadow-md bg-blue-600 border-blue-500 focus:bg-blue-500 active:bg-blue-700 transition-colors duration-150"
                : "px-4 py-2 rounded-xl shadow-md bg-blue-600 border-blue-500 focus:bg-blue-500 active:bg-blue-700 transition-colors duration-150"}
            focusable
            onPress={() => { press(); props.onAction?.(count()); }}
          >
            <Text className={props.compact ? "text-xs text-white font-bold" : props.largeLayout ? "text-2xl text-white font-bold" : "text-base text-white font-bold"}>{props.actionLabel}</Text>
          </View>
          <View debugName="HeroCounter">
            <Text className={props.compact ? "text-xs text-slate-600" : props.largeLayout ? "text-xl text-slate-600" : "text-sm text-slate-600"}>Count: {count()}</Text>
          </View>
        </View>
        <Show when={count() > 3}>
          <Text className={props.compact ? "text-xs text-emerald-600" : props.largeLayout ? "text-xl text-emerald-600" : "text-sm text-emerald-600"}>Reactive on real hardware.</Text>
        </Show>
      </View>
    </View>
  );
}
