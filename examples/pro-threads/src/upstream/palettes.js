/*
 * Palettes shared by the wallpaper and the hero scenes.
 */

// Palettes, in the manner of Apple's chip art: each ramp shifts hue as it
// brightens (oxblood to orange to cream, indigo to violet to pink), and
// the fibres take colours from the same family so they glow rather than
// clash. The first is the original's.
const palette = (shadow, steel, silver, highlight, glow, background, fibreCool, warmLight, warmMid, warmDeep) =>
  ({ shadow, steel, silver, highlight, glow, background, fibreCool, warmLight, warmMid, warmDeep });
export const PALETTES = {
  'XDR Blue': palette('#1a1d24', '#475e7a', '#a3b8d1', '#e6ebf2', '#ffad66', '#000000', '#38a3eb', '#fff2ad', '#f5ba29', '#db3317'),
  Graphite: palette('#1b1b1d', '#4b4b51', '#a7a7ae', '#ececef', '#ffb57a', '#000000', '#9db6cf', '#fff0c8', '#ffb347', '#e0533a'),
  Ember: palette('#2b0c06', '#c2361a', '#ff9a42', '#fff0cf', '#ffe08a', '#040100', '#ffd36b', '#fff6c9', '#ffb22e', '#ff3b6b'),
  Chroma: palette('#120c2c', '#6d3df0', '#ff6fb6', '#ffe2b8', '#ffb36b', '#020106', '#62d6ff', '#fff1d6', '#ffa94a', '#ff3d8b'),
  Violet: palette('#170b33', '#6231e0', '#c890ff', '#fcecff', '#ff9ad6', '#020005', '#7fdcff', '#ffe9f7', '#ff7ac8', '#ff4f6e'),
  Ocean: palette('#06123a', '#1f55e6', '#4fd0ff', '#ebfbff', '#8ef3ff', '#000207', '#b0fbff', '#f2fffb', '#7df0d6', '#7a5cff'),
  Aurora: palette('#04211f', '#0c8a78', '#57e6c6', '#ecfff9', '#c6ff8f', '#000303', '#9ff6ff', '#fbffe0', '#c8f56a', '#ff7cc4'),
  'Rose Gold': palette('#2a1210', '#b0584a', '#f6b29b', '#fff3ec', '#ffd2a3', '#030101', '#ffe0cf', '#fff1dc', '#ffb16b', '#e0466e'),
  Paper: palette('#2a2e36', '#6b7a8f', '#bfc8d4', '#fbfcfd', '#ff9c5a', '#e9e6df', '#3f86d6', '#ffe6a3', '#f2a023', '#d6331c'),
};
