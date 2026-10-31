// One calm palette: system blue for the accent, soft grays for the rest. Importing this sets it for the kit's controls.
import { setColors, setColorMode, NuxtColors } from 'zinc:ui/nuxt';

const colors = new NuxtColors();
colors.primary = 'blue';
colors.neutral = 'slate';
setColors(colors);
setColorMode('light');
