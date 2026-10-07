// A fixture for the baker (ZN-105): a JPEG in the assets directory is decoded and baked like a PNG.
import { onFrame, clear, image, drawImage } from 'zinc:gfx';
onFrame((dt: number) => { clear(0xffffff); drawImage(image('photo.jpg'), 4, 4, 48, 32, 255, 0); });
