// ZN-710: a project that imports two plugins; `zinc run` names them on stderr (tests/t0/plugins_line.sh).
import { Gestures } from 'zinc:gestures';
import { Stroke } from 'zinc:ink';
const used = [typeof Gestures, typeof Stroke];   // used, so the plugins load as code, not only as types
console.log('plugins line');
