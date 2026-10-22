// Generated from zinc-ui/1. Re-export replaces this file; keep application logic in your caller.
import { createSignal } from 'zinc:ui/solid';
import { StyleSheet } from 'zinc:ui';
const __shared = StyleSheet.create({
  "screen": {
    "width": "100%",
    "height": "100%",
    "padding": 24,
    "gap": 16,
    "backgroundColor": "#f1f5f9"
  },
  "card": {
    "padding": 20,
    "gap": 12,
    "backgroundColor": "#ffffff",
    "borderRadius": 16
  },
  "title": {
    "fontSize": 24,
    "color": "#0f172a",
    "fontWeight": "bold"
  },
  "action": {
    "padding": 12,
    "backgroundColor": "#2563eb",
    "color": "#ffffff",
    "borderRadius": 8
  }
});
export interface TemperatureCardProps {
  temperature?: () => number;
  targetChanged?: (value: number) => void;
}
export function TemperatureCard(props: TemperatureCardProps): i32 {
  return (
    <View style={[__shared.card]}>
      <Text style={[__shared.title]}>
        {"Temperature"}
      </Text>
      <Text style={[{ "fontSize": 32, "color": "#2563eb" }]}>
        {'' + (props.temperature !== undefined ? props.temperature() : 21)}
      </Text>
      <Button className="bg-slate-700 px-2 py-1" style={[__shared.action]} onClick={() => { if (props.targetChanged !== undefined) props.targetChanged(22); }}>
        {"Set to 22"}
      </Button>
    </View>
  );
}

export interface ThermostatAppProps {
  temperature?: () => number;
  targetChanged?: (value: number) => void;
}
export function ThermostatApp(props: ThermostatAppProps): i32 {
  const [screen, setScreen] = createSignal<string>("home");
  const history: string[] = [];
  return <View style={{ width: "100%", height: "100%" }}>
    <Show when={screen() === "home"}>
      <View style={[__shared.screen]}>
        <TemperatureCard temperature={() => (props.temperature !== undefined ? props.temperature() : 21)} targetChanged={(value: number) => { if (props.targetChanged !== undefined) props.targetChanged(value); }} />
        <Button className="bg-slate-700 px-2 py-1" style={[__shared.action]} onClick={() => { if (screen() !== "details") { history.push(screen()); setScreen("details"); } }}>
          {"Details"}
        </Button>
      </View>
    </Show>
    <Show when={screen() === "details"}>
      <View style={[__shared.screen]}>
        <Text style={[__shared.title]}>
          {"Connected component"}
        </Text>
        <Button className="bg-slate-700 px-2 py-1" style={[__shared.action]} onClick={() => { if (history.length > 0) setScreen(history.pop()); }}>
          {"Back"}
        </Button>
      </View>
    </Show>
  </View>;
}
