// Calls into a user native module are direct C++ virtual calls (NAT-04); sim uses native/sensor.sim.ts.
import Sensor from './native/sensor.spec';
import * as telemetry from 'zinc:telemetry';

telemetry.expose('temperature', () => Sensor.temperature());
console.log('sensor', Sensor.serial());
for (let i = 0; i < 3; i++) console.log('reading', Sensor.temperature());
Sensor.setLed(true);
