// What the marquee shows. Each message has its own font and colouring; edit freely.
import { FONT_5X7, FONT_3X5 } from 'zinc:pixelfont';

export class Message {
  text: string;
  font: i32;
  /** true: every letter takes the next colour of the rainbow; false: one colour (`color`). */
  rainbow: boolean;
  color: u32;
  constructor(text: string, font: i32, rainbow: boolean, color: u32) {
    this.text = text; this.font = font; this.rainbow = rainbow; this.color = color;
  }
}

export const MESSAGES: Message[] = [
  new Message('Hello from Zinc!', FONT_5X7, true, 0),
  new Message('TypeScript -> C++ -> ESP32-S3', FONT_5X7, false, 0x20a0ff),
  new Message('tiny 3x5 font too', FONT_3X5, true, 0),
  new Message('shake me for the next line', FONT_5X7, false, 0xffa020),
];
