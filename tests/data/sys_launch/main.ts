// zinc:sys launchDir and locale (ZN-687): where the user ran the program from (zinc run starts it in the project directory, cwd() shows it),
// the system's preferred language, and execPath: the program's own executable (zinc itself when interpreted). tests/t1/sys_launch.sh runs it from another directory, interpreted, compiled and built.
import * as sys from 'zinc:sys';
console.log(`launch ${sys.launchDir()}`);
console.log(`cwd ${sys.cwd()}`);
console.log(`locale ${sys.locale()}`);
console.log(`exe ${sys.execPath()}`);
