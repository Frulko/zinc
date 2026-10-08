import * as sys from 'zinc:sys';

const args = sys.args();
console.log(`hello from ${sys.platform()}`, args);
