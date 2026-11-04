// Playback and light defaults adapted from Kubai087's PRO Threads (MIT).
const DEFAULTS = {
  view: 'word', text: 'PRO', width: 2000, height: 1293, stretch: 0,
  speed: 1.6, breathe: 1.5, swell: 2, fibrePace: 1.4, paused: false,
  gain: 1.5, density: 1, texture: 1, rim: 1, reach: 1,
  floorDim: 0.2, floorLit: 0.52, warm: 0.6, sparkle: 1,
  shadow: '#1a1d24', steel: '#475e7a', silver: '#a3b8d1', highlight: '#e6ebf2',
  glow: '#ffad66', background: '#000000', fibreCool: '#38a3eb',
  warmLight: '#fff2ad', warmMid: '#f5ba29', warmDeep: '#db3317',
  corner: 28, arch: 40, tip: 66, spacing: 90, rowGap: 0.22,
};

const EFFECTS = {
  Original: { speed: 1.6, breathe: 1.5, swell: 2, fibrePace: 1.4, gain: 1.5, reach: 1, floorDim: 0.2, floorLit: 0.52, density: 1, texture: 1, rim: 1, warm: 0.6, sparkle: 1 },
  Calm: { speed: 0.4, breathe: 0.6, swell: 0.5, fibrePace: 0.5, gain: 1.45, reach: 1.1, floorDim: 0.2, floorLit: 0.52, density: 1, texture: 0.9, rim: 1, warm: 0.5, sparkle: 0.7 },
  Lively: { speed: 2.6, breathe: 2.2, swell: 2.8, fibrePace: 3, gain: 1.55, reach: 1, floorDim: 0.22, floorLit: 0.52, density: 1, texture: 1.1, rim: 1.1, warm: 0.75, sparkle: 1.3 },
  Silk: { speed: 0.7, breathe: 1, swell: 1, fibrePace: 0.8, gain: 1.5, reach: 1.4, floorDim: 0.24, floorLit: 0.56, density: 0.7, texture: 0.4, rim: 0.6, warm: 0.5, sparkle: 0.6 },
  'Fine Wire': { speed: 1, breathe: 1, swell: 1, fibrePace: 1, gain: 1.45, reach: 0.9, floorDim: 0.16, floorLit: 0.46, density: 2, texture: 1.6, rim: 1.5, warm: 0.6, sparkle: 1 },
  Glow: { speed: 0.9, breathe: 1.2, swell: 1.4, fibrePace: 1, gain: 1.9, reach: 1.8, floorDim: 0.26, floorLit: 0.66, density: 1, texture: 0.9, rim: 1.6, warm: 1, sparkle: 1.2 },
  'Low Light': { speed: 0.8, breathe: 1, swell: 1, fibrePace: 0.8, gain: 1.1, reach: 0.7, floorDim: 0.08, floorLit: 0.35, density: 1, texture: 1.1, rim: 0.8, warm: 0.4, sparkle: 0.8 },
};


export const state = { ...DEFAULTS };
export { EFFECTS };
