import Sensor from '../../examples/native-module/native/sensor.spec';
console.log(Sensor.serial());
console.log(Sensor.temperature());
Sensor.setLed(true);
console.log(Sensor.temperature());
