// <Image image={handle}>: a runtime image (imageFromPixels) in an Image node; the first follows a signal (red, then blue), the second stays red.
import { render, createSignal } from 'zinc:ui/solid';
import { imageFromPixels } from 'zinc:gfx';
const px: u8[] = [];
for (let i = 0; i < 16; i++) { px.push(255); px.push(0); px.push(0); px.push(255); }
const red = imageFromPixels(px, 4, 4);
for (let i = 0; i < 16; i++) { px[i * 4] = 0; px[i * 4 + 2] = 255; }
const blue = imageFromPixels(px, 4, 4);
const [img, setImg] = createSignal(red);
setTimeout(() => setImg(blue), 50);
render(() => <View className="w-full h-full bg-white"><Image image={img()} className="w-[40] h-[40]" /><Image image={red} className="w-[40] h-[40]" /></View>, 0xffffff, null);
