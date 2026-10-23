import { Svg } from 'zinc:svg';
import { readText } from 'zinc:fs';
import { repositoryRoot } from '../services/paths';

const art = new Svg(readText(repositoryRoot() + '/image/builder/assets/hardware.svg'));

export function Hardware(): i32 {
  return <Canvas className="w-[210px] h-[120px] shrink-0 max-[1000px]:hidden" style={{ lazy: 1 }}
    onDraw={(x: i32, y: i32, w: i32, h: i32) => art.draw(x, y, w, h, 255)} />;
}
