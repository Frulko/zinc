import * as sys from 'zinc:sys';
import { runCli } from './cli';
const code = runCli(sys.args());
if (code >= 0) sys.exit(code);
