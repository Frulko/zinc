// zinc:sf-symbols: Apple's icons, drawn by the system so they match the rest of macOS.
//   <Image image={symbol('sun.max', 16, 12)} className="w-[16px] h-[16px] tint-[#3a3a3c]" />
import N from './native/symbols.spec';

export const WEIGHT_REGULAR = 0, WEIGHT_MEDIUM = 0.23, WEIGHT_SEMIBOLD = 0.3;

/** A white image of the symbol, `side` points square with the glyph centred at `pointSize`; tint it with `tint-*`. -1 for an unknown name. */
export function symbol(name: string, side: number, pointSize: number, weight: number = WEIGHT_REGULAR): number {
  return N.image(name, side, pointSize, weight);
}
