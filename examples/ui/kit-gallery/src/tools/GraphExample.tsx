/** @jsxHelpers zinc:ui/kit/host */
import { NodeEditor, ToolNode, NodeLink, FlameGraph, FlameSpan, NumberField, heading, theme } from 'zinc:ui/kit';
import { componentSignal } from 'zinc:ui/kit/host';
export function GraphExample(): i32 {
  const [gain, setGain] = componentSignal(-6);
  const [nodes, setNodes] = componentSignal<ToolNode[]>([
    {
      id: 'source',
      label: 'Oscillator',
      x: 20,
      y: 20,
      width: 180,
      pins: [{ id: 'audio', label: 'Audio', type: 'audio', output: true }],
      children: () => <Text className={`text-[12px] text-${theme().mutedForeground}`}>440 Hz · sine</Text>,
    },
    {
      id: 'gain',
      label: 'Gain',
      x: 280,
      y: 60,
      width: 210,
      pins: [
        { id: 'input', label: 'Input', type: 'audio', output: false },
        { id: 'audio', label: 'Audio', type: 'audio', output: true },
      ],
      children: () => <NumberField label="Node gain" value={gain} onChange={setGain} min={-60} max={6} step={0.1} />,
    },
    {
      id: 'output',
      label: 'Output',
      x: 570,
      y: 20,
      width: 180,
      pins: [{ id: 'input', label: 'Input', type: 'audio', output: false }],
    },
  ]);
  const [links, setLinks] = componentSignal<NodeLink[]>([
    { id: 'initial', fromNode: 'source', fromPin: 'audio', toNode: 'gain', toPin: 'input' },
  ]);
  const spans: FlameSpan[] = [
    { id: 'frame', label: 'Frame', start: 0, duration: 16.6, depth: 0 },
    { id: 'input', label: 'Input', start: 0, duration: 1.2, depth: 1 },
    { id: 'layout', label: 'Layout', start: 1.3, duration: 4.5, depth: 1 },
    { id: 'measure', label: 'Measure', start: 1.4, duration: 1.6, depth: 2 },
    { id: 'place', label: 'Place', start: 3.1, duration: 2.6, depth: 2 },
    { id: 'paint', label: 'Paint', start: 6, duration: 8, depth: 1 },
    { id: 'text', label: 'Text', start: 6.2, duration: 3, depth: 2 },
    { id: 'raster', label: 'Raster', start: 9.3, duration: 4.2, depth: 2 },
  ];
  return (
    <View className="flex-col gap-6 min-w-0">
      <Text className={heading(3)}>Node editor</Text>
      <NodeEditor nodes={nodes} links={links} onNodesChange={setNodes} onLinksChange={setLinks} height={300} />
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>
        Shift selects nodes together. Drag a title to move, or empty space to select. Middle-button or Space-drag pans. Tab to output and input pins to connect.
      </Text>
      <Text className={heading(3)}>Flame graph</Text>
      <FlameGraph spans={() => spans} start={0} end={16.6} height={150} />
    </View>
  );
}
