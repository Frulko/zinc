// components/qr-code-node.ts — A QR code, one rectangle per dark run.

import { encode, QrCode } from 'zinc:qrcode';
import { rect } from 'zinc:gfx';
import { DisplayObject } from 'zinc:stage';

const QUIET_MODULES = 3;   // the white border a phone's camera needs

export class QrCodeNode extends DisplayObject {
  private text: string = '';
  private code: QrCode | null = null;

  constructor(side: number) {
    super('QrCode');
    this.width = side;
    this.height = side;
  }

  show(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.code = text === '' ? null : encode(text);
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    if (this.code === null) return;
    const code = this.code as QrCode;
    const moduleSize = Math.floor(viewWidth / (code.size + QUIET_MODULES * 2));
    rect(0, 0, viewWidth, viewHeight, 0xffffff);
    const origin = Math.floor((viewWidth - moduleSize * code.size) / 2);
    for (let y: i32 = 0; y < code.size; y++) {
      const runs = code.runs(y);
      for (let i = 0; i < runs.length; i += 2) {
        rect(origin + runs[i] * moduleSize, origin + y * moduleSize, runs[i + 1] * moduleSize, moduleSize, 0x000000);
      }
    }
  }
}
