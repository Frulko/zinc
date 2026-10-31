// The app's icon (zinc.json app.icon), for the sidebar and the Settings page; the sketch glyph when it has none.
import { imageFromBytes, drawImage, rrect } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import { theme, bg, fg } from 'zinc:editor';
import { iconPath } from '../app/project';
import { Glyph } from './Controls';
import { I_GRID } from './icons';

// the icon's image, decoded once per file
let iconOf = '', iconImage: i32 = -1;
function icon(): i32 {
  const path = iconPath();
  if (path !== iconOf) { iconOf = path; iconImage = -1; if (path !== '') { try { iconImage = imageFromBytes(fs.readBytes(path)); } catch (e) { } } }
  return iconImage;
}
/** The app's icon; without one, its initial on the accent, as a new app's placeholder (the sketch glyph when nothing is open). */
export function ProjectIcon(props: { size: i32; name: () => string }): i32 {
  const initial = (): string => props.name() === '' ? '' : props.name().slice(0, 1).toUpperCase();
  return <View className="items-center justify-center" style={{ width: props.size, height: props.size }}>
    {iconPath() !== ''
      ? <Canvas style={{ width: props.size, height: props.size }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { const img = icon(); if (img >= 0) drawImage(img, x, y, w, h, 255, w / 4.5); else rrect(x, y, w, h, w / 4.5, theme().chrome, 255); }} />
      : initial() !== ''
        ? <View className={`w-full h-full items-center justify-center ${bg(theme().accent)}`} style={{ borderRadius: props.size / 4.5 }}>
            <Text className={`font-bold ${fg(theme().onAccent)}`} style={{ fontSize: Math.round(props.size * 0.5) }}>{initial()}</Text>
          </View>
        : <Glyph kind={I_GRID} size={props.size < 16 ? props.size : 16} color={() => theme().muted} back={() => theme().sidebar} />}
  </View>;
}
