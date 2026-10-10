// zinc:sys launchDir and locale (ZN-687): where the user ran the program from (zinc run starts it in the project directory, cwd() shows it),
// and the system's preferred language. tests/t1/sys_launch.sh runs it from another directory, interpreted, compiled and built.
import * as sys from 'zinc:sys';
console.log(`launch ${sys.launchDir()}`);
console.log(`cwd ${sys.cwd()}`);
console.log(`locale ${sys.locale()}`);
