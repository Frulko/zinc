// Test entry of the font (next/tests/t1/nuxt_ui.sh, ZN-379): with setFontSans('PublicSans') the default sans text resolves to assets/PublicSans*.ttf at
// 400, 500, 600 and 700 (font-normal, font-medium, font-semibold, font-bold), and font-mono stays JetBrains Mono.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { quit, font } from 'zinc:gfx';

ui.setFontSans('PublicSans');
function App(): i32 {
  return <View class="flex-col">
    <Text class="text-sm font-normal">Regular</Text>
    <Text class="text-sm font-medium">Medium</Text>
    <Text class="text-sm font-semibold">SemiBold</Text>
    <Text class="text-sm font-bold">Bold</Text>
    <Text class="text-sm font-mono">Mono</Text>
  </View>;
}
const FACES = ['PublicSans', 'PublicSans-Medium', 'PublicSans-SemiBold', 'PublicSans-Bold', 'mono'];
render(App, 0xffffff, (dt: number) => {
  const got: string[] = [];
  for (let i = 0; i < FACES.length; i++) {
    const f = ui.textFont(ui.find(['Regular', 'Medium', 'SemiBold', 'Bold', 'Mono'][i]));
    got.push(`${FACES[i]} ${f >= 0 && f === font(FACES[i], 14)} ${f !== font('sans', 14) && f !== font('sans-bold', 14)}`);
  }
  console.log(got.join(' | '));
  quit();
});
