import { stageSvg } from '../library/stage-defaults';
export default function screen(progress: number, dt: number): void {
  if (stageSvg().length < 0) throw new Error('invalid loader stage');
}
