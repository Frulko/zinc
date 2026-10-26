// Finger-sized buttons for e-paper: filled black for the main action, outlined for the others. No press feedback (see main.tsx): while an
// action runs every button greys and takes no tap, so a press shows at once and cannot start a second action.
import { BUTTON, BUTTON_LABEL, OUTLINE_BUTTON, OUTLINE_LABEL } from '../constants';
import { busy } from '../state';

export function SolidButton(props: { label: string; onClick: () => void }): i32 {
  return <Button className={BUTTON} disabled={busy()} onClick={props.onClick}><Text className={BUTTON_LABEL}>{props.label}</Text></Button>;
}
export function OutlineButton(props: { label: string; onClick: () => void }): i32 {
  return <Button className={OUTLINE_BUTTON} disabled={busy()} onClick={props.onClick}><Text className={OUTLINE_LABEL}>{props.label}</Text></Button>;
}
