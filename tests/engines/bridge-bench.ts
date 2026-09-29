import Sensor from '../../examples/native-module/native/sensor.spec';
let checksum: number = 0;
for (let i: i32 = 0; i < 100000; i++) checksum += Sensor.temperature();
console.log(checksum);
