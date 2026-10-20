// The program after the loader stage (tests/t1/loader.sh): its modules start once the stage has made the boot group resident.
import { onFrame, clear, rect, width, height } from 'zinc:gfx';
import { isLoaded, get } from 'zinc:assets';

console.log(`main: boot loaded ${isLoaded('boot')}, level loaded ${isLoaded('level')}, ${get('boot/d.json').text()}`);
let n = 0;
onFrame((dt: number) => {
  clear(0x204020);
  rect(20, 20, width() - 40, height() - 40, 0xe0a030);
  n++;
  if (n === 3) console.log('main: 3 frames');
});
