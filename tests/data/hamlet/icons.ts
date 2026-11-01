// Headless proof that every resource and building of economy.json has its own icon (no coin fallback). No window.
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { ROLE_NAMES } from '../../../examples/hamlet/src/constants';
import { hasResourceIcon } from '../../../examples/hamlet/src/ui/icons';
import * as fs from 'zinc:fs';

loadEconomy(fs.readText('examples/hamlet/assets/economy.json'), MODEL_IDS, ROLE_NAMES);   // run from the repository root
let failures = 0;
for (const r of economy.resources) if (!hasResourceIcon(r.id)) { console.log('hamlet icons: resource ' + r.id + ' has no icon FAIL'); failures++; }
for (let t = 0; t < economy.buildings.length; t++) if (MODEL_IDS[t] !== economy.buildings[t].id) { console.log('hamlet icons: building ' + economy.buildings[t].id + ' has no model to bake an icon from FAIL'); failures++; }
console.log('hamlet icons: ' + economy.resources.length + ' resources, ' + economy.buildings.length + ' buildings ' + (failures === 0 ? 'ALL PASS' : 'FAIL'));
