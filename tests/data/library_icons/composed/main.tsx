import { render } from 'zinc:ui/solid';
import { ReachedDefault } from '../library/defaults';
import { Panels } from './panels';
import { iconNames, icon } from 'zinc:icons';
function UnusedApp(): i32 { return <View><Panels /></View>; }
render(ReachedDefault, 0xffffff, null);
for (const name of iconNames()) { const svg = icon(name); if (svg === null || !svg.ok || svg.items() === 0) throw new Error('composed SVG did not parse'); }
console.log('composed-icons:' + iconNames().join(','));
