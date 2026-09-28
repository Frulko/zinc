// ZincStudio: a node-based editor for Zinc apps (in the spirit of Choregraphe).
//   zinc run apps/studio                       opens the last project, or the hello-flow sample
//   zinc run apps/studio -- <project.zproj>    opens that project
//   zinc run apps/studio -- --generate <project.zproj>   headless: writes build/src/main.ts and exits
import * as sys from 'zinc:sys';
import { runCli } from './cli';
import { startApp } from './ui/app';

const args = sys.args();
const code = runCli(args);
if (code >= 0) sys.exit(code);
startApp(args.length > 0 && !args[0].startsWith('-') ? args[0] : '');
