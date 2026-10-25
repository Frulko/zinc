// Finger-sized buttons for e-paper: filled black for the main action, outlined for the others. No press feedback (see main.tsx).
import { BUTTON, BUTTON_LABEL, OUTLINE_BUTTON, OUTLINE_LABEL } from '../constants';

export function SolidButton(props: { label: string; onClick: () => void }): i32 {
  return <Button className={BUTTON} onClick={props.onClick}><Text className={BUTTON_LABEL}>{props.label}</Text></Button>;
}
export function OutlineButton(props: { label: string; onClick: () => void }): i32 {
  return <Button className={OUTLINE_BUTTON} onClick={props.onClick}><Text className={OUTLINE_LABEL}>{props.label}</Text></Button>;
}
