// zinc:ui/platform — the look of each platform as data (ZN-748, docs/ui.md "Platform look"). The kits (zinc:ui/kit, zinc:ui/nuxt) and
// zinc:react-native read these tokens instead of hard-coding one look: a redesign of iOS or Material is a change of these tables, not of
// the components. NEUTRAL is the kits' own look (shadcn/ui's sizes, Inter): every program that does not ask for a platform keeps it.
//
// Sources: Apple's HIG and UIKit metrics (UISwitch 51 x 31, thumb 27; 44 pt touch targets; Dynamic Type's large sizes: body 17, title 1 28,
// large title 34; macOS: body 13, NSSwitch 38 x 22, push buttons 22 high); Material 3 (Flutter's _SwitchConfigM3: track 52 x 32, thumb 16 off,
// 24 on, 2 px outline; buttons 40 high and fully rounded; the type scale: body large 16, headline small 24, title large 22; the baseline
// colour scheme 6750a4); Apple's system colours (systemBlue 007aff / 0a84ff, systemGreen 34c759 / 30d158, systemFill greys).
// Lengths are px, colours 0xRRGGBB as [light, dark].

/** A text class of `px` pixels, built when the program runs: the baker bakes the sizes it finds written in the sources (src/res/res.cpp), and the
 *  sizes of the looks a program does not use must not grow it; the size in use is rasterized from the embedded font at its first text. */
function tx(px: number, rest: string): string { return tw('[' + px + 'px]', rest); }
/** The same with a Tailwind size name ('sm': 14 px and its line height). */
function tw(size: string, rest: string): string { return rest === '' ? 'text-' + size : 'text-' + size + ' ' + rest; }

export interface Look {
  name: string;               // 'ios' | 'android' | 'macos' | 'neutral'
  // ---- the kit's class fragments (Tailwind): sizes sm, default, lg, icon
  button: string[];           // height, padding, gap and radius per size
  buttonText: string[];       // [sm, the others]: size and weight
  segTrack: string;           // a segmented control (kit Tabs): the track, a segment, the selected one, the label
  segItem: string;
  segOn: string;
  segLabel: string;
  headings: string[];         // levels 1 to 4
  lead: string; body: string; small: string; muted: string; caption: string; overline: string;
  // ---- the drawn controls (px)
  switchW: number; switchH: number; thumbOff: number; thumbOn: number; outline: number;   // the track, the thumb off and on, its border
  sliderTrack: number; sliderThumb: number; sliderThumbTint: boolean;                      // the thumb filled with the tint (Material) or white
  spinner: string;            // ActivityIndicator: 'bars' (iOS, macOS) or 'arc' (Material)
  fonts: string;              // the UI font families, first found wins (an app's assets); none: the built-in Inter
  // ---- colours [light, dark]
  tint: i32[]; onTint: i32[]; tintPressed: i32[];   // the accent: filled buttons, a slider's range, links
  switchOn: i32[]; switchOff: i32[]; thumb: i32[]; thumbDim: i32[];   // the thumb on, and off (Material: the outline colour)
  fill: i32[];                // quiet fills: a segmented track (iOS, macOS), the selected segment (Material)
  raised: i32[];              // a raised surface on a fill: the selected segment (iOS, macOS)
  border: i32[];              // outlines: Material's switch and segmented buttons
  label: i32[]; label2: i32[]; separator: i32[];
}

export const IOS: Look = {
  name: 'ios',
  button: ['h-[34px] px-3 gap-1.5 rounded-[8px]', 'h-[44px] px-5 gap-2 rounded-[12px]', 'h-[50px] px-6 gap-2 rounded-[14px]', 'h-[44px] w-[44px] px-0 rounded-full'],
  buttonText: [tx(15, 'font-semibold'), tx(17, 'font-semibold')],
  segTrack: 'p-[2px] gap-0 rounded-[9px] bg-[var(--pfFill)]', segItem: 'h-[28px] px-3 rounded-[7px]', segOn: 'bg-[var(--pfRaised)] shadow-sm', segLabel: tx(13, 'font-medium'),
  headings: [tx(34, 'font-bold'), tx(28, 'font-bold'), tx(22, 'font-bold'), tx(20, 'font-semibold')],
  lead: tx(20, ''), body: tx(17, 'leading-[22px]'), small: tx(15, ''), muted: tx(15, ''), caption: tx(12, ''), overline: tx(13, ''),
  switchW: 51, switchH: 31, thumbOff: 27, thumbOn: 27, outline: 0,
  sliderTrack: 4, sliderThumb: 28, sliderThumbTint: false,
  spinner: 'bars', fonts: 'SF Pro Text,SFProText-Regular,SF Pro',
  tint: [0x007aff, 0x0a84ff], onTint: [0xffffff, 0xffffff], tintPressed: [0x0062cc, 0x409cff],
  switchOn: [0x34c759, 0x30d158], switchOff: [0xe9e9ea, 0x39393d], thumb: [0xffffff, 0xffffff], thumbDim: [0xffffff, 0xffffff],
  fill: [0xeeeeef, 0x1c1c1f], raised: [0xffffff, 0x636366], border: [0xc6c6c8, 0x38383a],
  label: [0x000000, 0xffffff], label2: [0x8a8a8e, 0x98989f], separator: [0xc6c6c8, 0x38383a],
};

export const ANDROID: Look = {
  name: 'android',
  button: ['h-[32px] px-4 gap-1.5 rounded-full', 'h-[40px] px-6 gap-2 rounded-full', 'h-[48px] px-8 gap-2 rounded-full', 'h-[40px] w-[40px] px-0 rounded-full'],
  buttonText: [tx(12, 'font-medium'), tx(14, 'font-medium')],
  segTrack: 'p-0 gap-0 rounded-full border border-[var(--pfBorder)]', segItem: 'h-[38px] px-3 rounded-full', segOn: 'bg-[var(--pfFill)]', segLabel: tx(14, 'font-medium'),
  headings: [tx(32, ''), tx(28, ''), tx(24, ''), tx(22, '')],
  lead: tx(16, ''), body: tx(16, 'leading-[24px]'), small: tx(14, ''), muted: tx(14, ''), caption: tx(12, ''), overline: tx(12, 'font-medium'),
  switchW: 52, switchH: 32, thumbOff: 16, thumbOn: 24, outline: 2,
  sliderTrack: 4, sliderThumb: 20, sliderThumbTint: true,
  spinner: 'arc', fonts: 'Roboto,Roboto-Regular',
  tint: [0x6750a4, 0xd0bcff], onTint: [0xffffff, 0x381e72], tintPressed: [0x7965af, 0xbba6f0],
  switchOn: [0x6750a4, 0xd0bcff], switchOff: [0xe6e0e9, 0x36343b], thumb: [0xffffff, 0x381e72], thumbDim: [0x79747e, 0x938f99],
  fill: [0xe8def8, 0x4a4458], raised: [0xffffff, 0x2b2930], border: [0x79747e, 0x938f99],
  label: [0x1d1b20, 0xe6e0e9], label2: [0x49454f, 0xcac4d0], separator: [0xcac4d0, 0x49454f],
};

export const MACOS: Look = {
  name: 'macos',
  button: ['h-[20px] px-2 gap-1 rounded-[5px]', 'h-[24px] px-3 gap-1.5 rounded-[6px]', 'h-[30px] px-4 gap-2 rounded-[7px]', 'h-[24px] w-[24px] px-0 rounded-[6px]'],
  buttonText: [tx(11, ''), tx(13, '')],
  segTrack: 'p-[1px] gap-0 rounded-[6px] bg-[var(--pfFill)]', segItem: 'h-[20px] px-2 rounded-[5px]', segOn: 'bg-[var(--pfRaised)] shadow-sm', segLabel: tx(13, ''),
  headings: [tx(26, 'font-bold'), tx(22, 'font-semibold'), tx(17, 'font-semibold'), tx(15, 'font-semibold')],
  lead: tx(15, ''), body: tx(13, 'leading-[18px]'), small: tx(13, ''), muted: tx(13, ''), caption: tx(10, ''), overline: tx(11, 'font-semibold'),
  switchW: 38, switchH: 22, thumbOff: 20, thumbOn: 20, outline: 0,
  sliderTrack: 4, sliderThumb: 20, sliderThumbTint: false,
  spinner: 'bars', fonts: 'SF Pro Text,SFProText-Regular,SF Pro',
  tint: [0x007aff, 0x0a84ff], onTint: [0xffffff, 0xffffff], tintPressed: [0x0062cc, 0x409cff],
  switchOn: [0x007aff, 0x0a84ff], switchOff: [0xe3e3e3, 0x3a3a3c], thumb: [0xffffff, 0xdcdcdc], thumbDim: [0xffffff, 0xdcdcdc],
  fill: [0xe4e4e4, 0x2c2c2e], raised: [0xffffff, 0x5a5a5e], border: [0xd1d1d1, 0x4a4a4c],
  label: [0x1d1d1f, 0xe5e5e5], label2: [0x808080, 0x9a9a9a], separator: [0xe5e5e5, 0x3a3a3a],
};

/** The kits' own look (shadcn/ui's sizes and type scale): what they drew before platform looks existed, unchanged. */
export const NEUTRAL: Look = {
  name: 'neutral',
  button: ['h-8 px-3 gap-1.5 rounded-md', 'h-9 px-4 gap-2 rounded-md', 'h-10 px-6 gap-2 rounded-md', 'h-9 w-9 px-0 rounded-md'],
  buttonText: [tw('xs', 'font-medium'), tw('sm', 'font-medium')],
  segTrack: 'p-1 gap-1 rounded-lg', segItem: 'h-7 px-3 rounded-md', segOn: '', segLabel: tw('sm', 'font-medium'),
  headings: [tw('3xl', 'font-bold tracking-tight'), tw('2xl', 'font-semibold tracking-tight'), tw('xl', 'font-semibold tracking-tight'), tw('lg', 'font-semibold')],
  lead: tw('lg', ''), body: tw('base', 'leading-7'), small: tw('sm', ''), muted: tw('sm', ''), caption: tw('xs', ''), overline: tw('xs', 'font-semibold tracking-wider'),
  switchW: 36, switchH: 20, thumbOff: 16, thumbOn: 16, outline: 0,
  sliderTrack: 6, sliderThumb: 16, sliderThumbTint: false,
  spinner: 'bars', fonts: '',
  // React Native's components keep the light iOS colours they always drew (zinc:react-native reads [0] under the neutral look)
  tint: [0x007aff, 0x007aff], onTint: [0xffffff, 0xffffff], tintPressed: [0x0062cc, 0x0062cc],
  switchOn: [0x34c759, 0x34c759], switchOff: [0xe9e9ea, 0xe9e9ea], thumb: [0xffffff, 0xffffff], thumbDim: [0xffffff, 0xffffff],
  fill: [0xf4f4f5, 0x27272a], raised: [0xffffff, 0x18181b], border: [0xe4e4e7, 0x27272a],
  label: [0x09090b, 0xfafafa], label2: [0x71717a, 0xa1a1aa], separator: [0xe4e4e7, 0x27272a],
};
