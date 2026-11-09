import { Button, theme } from 'zinc:ui/kit';
import { NumberField } from './Field';
import { tr } from '../i18n';

export function CanvasTools(props: { zoom: () => number; fit: () => void; zoomBy: (factor: number) => void; pan: () => boolean; togglePan: () => void; step: () => number; setStep: (step: number) => void; move: (x: number, y: number) => void; next: () => void }): i32 {
  return <View className={`flex-row flex-wrap gap-1 items-center py-1 border-b border-${theme().border}`}>
    <Button size="sm" variant="ghost" label={tr('mapper.canvas.fit')} onClick={props.fit} />
    <Button size="sm" variant="ghost" label="−" ariaLabel={tr('mapper.canvas.zoomOut')} onClick={() => props.zoomBy(1 / 1.25)} />
    <Text className={`text-xs text-${theme().mutedForeground} w-[48] tabular-nums`}>{`${Math.round(props.zoom() * 100)} %`}</Text>
    <Button size="sm" variant="ghost" label="+" ariaLabel={tr('mapper.canvas.zoomIn')} onClick={() => props.zoomBy(1.25)} />
    <Button size="sm" pressed={props.pan()} variant={props.pan() ? 'default' : 'ghost'} label={tr('mapper.canvas.pan')} onClick={props.togglePan} />
    <View className="grow" />
    <Button size="sm" variant="ghost" label={tr('mapper.canvas.next')} onClick={props.next} />
    <Text className={`text-xs text-${theme().mutedForeground}`}>{tr('mapper.canvas.step')}</Text>
    <NumberField label={tr('mapper.canvas.step')} value={props.step} onChange={props.setStep} />
    <Text className={`text-xs text-${theme().mutedForeground}`}>px</Text>
    <Button size="sm" variant="ghost" label="←" disabled={props.pan()} ariaLabel={tr('mapper.canvas.left')} onClick={() => props.move(-1, 0)} />
    <Button size="sm" variant="ghost" label="→" disabled={props.pan()} ariaLabel={tr('mapper.canvas.right')} onClick={() => props.move(1, 0)} />
    <Button size="sm" variant="ghost" label="↑" disabled={props.pan()} ariaLabel={tr('mapper.canvas.up')} onClick={() => props.move(0, -1)} />
    <Button size="sm" variant="ghost" label="↓" disabled={props.pan()} ariaLabel={tr('mapper.canvas.down')} onClick={() => props.move(0, 1)} />
  </View>;
}
