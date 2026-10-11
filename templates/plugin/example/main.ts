// A program that uses the plugin: `zinc run` runs it (zinc.json "entry"; its "pluginDirs": [".."] finds the plugin in this directory).
import { greet, checksum } from 'zinc:{{id}}';

console.log(greet('Zinc'));
console.log('checksum of "zinc": ' + checksum('zinc'));
