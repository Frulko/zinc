// Every Lucide icon parses and draws with zinc:svg (ZN-374): zinc.json "icons": ["*"] compiles the whole set in.
import { iconNames, icon } from 'zinc:icons';
let ok = 0, bad = 0;
for (const n of iconNames()) {
  const s = icon(n, 0x000000, 2);
  if (s !== null && s.ok && s.items() > 0) ok++;
  else { bad++; if (bad <= 5) console.log('fails: ' + n); }
}
console.log('icons ' + iconNames().length + ', parsed ' + ok + ', failed ' + bad);
