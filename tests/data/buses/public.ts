import * as I2C from 'zinc:i2c';
import * as SPI from 'zinc:spi';
function check(value: boolean): void { if (!value) throw new Error('bus check failed'); }
check(I2C.list().includes('sim'));
check(SPI.list().includes('sim'));
check(I2C.scan('sim', 'receive-byte')[0] === 107);
const a = I2C.open('sim', 107);
const b = I2C.open('sim', 107);
check(a.readRegister(0, 1)[0] === 5);
a.write([2, 64]);
a.write([3, 22]);
check(b.readRegister(3, 1)[0] === 22);
a.close(); a.close();
const c = I2C.open('sim', 107);
let rejected = false;
try { a.readRegister(0, 1); } catch (e) { rejected = true; }
check(rejected); check(c.readRegister(0, 1)[0] === 5);
rejected = false;
try { c.readRegister(255, 1); } catch (e) { rejected = true; }
check(rejected);
rejected = false;
try { c.readRegister(95, 2); } catch (e) { rejected = true; }
check(rejected);
b.close(); c.close();
const x = SPI.open('sim', 1000000, 3);
const y = SPI.open('sim');
check(x.transfer([0, 255, 42])[1] === 255);
x.close(); x.close();
const z = SPI.open('sim');
rejected = false;
try { x.write([1]); } catch (e) { rejected = true; }
check(rejected); check(y.transfer([17])[0] === 17); check(z.transfer([23])[0] === 23);
y.close(); z.close();
rejected = false;
try { I2C.open('sim', 128); } catch (e) { rejected = true; }
check(rejected);
rejected = false;
try { SPI.open('sim', 100, 4); } catch (e) { rejected = true; }
check(rejected);
rejected = false;
try { I2C.scan('sim', 'automatic'); } catch (e) { rejected = true; }
check(rejected);
console.log('buses public ok');
