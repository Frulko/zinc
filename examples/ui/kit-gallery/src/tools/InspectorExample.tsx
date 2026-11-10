/** @jsxHelpers zinc:ui/kit/host */
import { PropertyInspector, heading, theme } from 'zinc:ui/kit';
import { componentSignal } from 'zinc:ui/kit/host';
export function InspectorExample(): i32 {
  const [name, setName] = componentSignal('Studio monitor'),
    [gain, setGain] = componentSignal('-6'),
    [voices, setVoices] = componentSignal('8'),
    [enabled, setEnabled] = componentSignal('true'),
    [mode, setMode] = componentSignal('stereo'),
    [color, setColor] = componentSignal('#2864c8ff'),
    [position, setPosition] = componentSignal('0,1.5,-2');
  return (
    <View className="flex-col gap-4 min-w-0">
      <Text className={heading(3)}>Property inspector</Text>
      <Text className={`text-[13px] text-${theme().mutedForeground}`}>
        Scrub numbers, edit exact values, resize the labels, or collapse a group.
      </Text>
      <PropertyInspector
        label="Monitor properties"
        properties={[
          { id: 'name', label: 'Name', type: 'text', value: name, onChange: setName, group: 'Monitor' },
          {
            id: 'gain',
            label: 'Gain (dB)',
            type: 'float',
            value: gain,
            onChange: setGain,
            step: 0.1,
            tooltip: 'Drag horizontally; Shift moves in fine steps.',
            group: 'Monitor',
          },
          {
            id: 'voices',
            label: 'Voices',
            type: 'integer',
            value: voices,
            onChange: setVoices,
            min: 1,
            max: 32,
            group: 'Monitor',
          },
          { id: 'enabled', label: 'Enabled', type: 'boolean', value: enabled, onChange: setEnabled, group: 'Monitor' },
          {
            id: 'mode',
            label: 'Channels',
            type: 'enum',
            value: mode,
            onChange: setMode,
            options: [
              { value: 'mono', label: 'Mono' },
              { value: 'stereo', label: 'Stereo' },
            ],
            group: 'Monitor',
          },
          {
            id: 'position',
            label: 'Position',
            type: 'vector',
            value: position,
            onChange: setPosition,
            step: 0.1,
            group: 'Appearance',
          },
          {
            id: 'color',
            label: 'Selection tint',
            type: 'color',
            value: color,
            onChange: setColor,
            group: 'Appearance',
          },
          {
            id: 'locked',
            label: 'Device identifier',
            type: 'text',
            value: () => 'monitor-07',
            onChange: (value: string) => {},
            disabled: true,
            group: 'Appearance',
          },
        ]}
      />
    </View>
  );
}
