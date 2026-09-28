// native-module: calling your own C++ from Zinc. `native/sensor.spec.ts` declares a typed interface; `zinc build`
// generates the matching C++ header, and each target provides an implementation (native/sensor.host.cpp on
// macOS / Linux, native/sensor.sim.ts on the sim). Calls are direct C++ virtual calls, no bridge, no marshalling.
import Sensor from '../native/sensor.spec';
import * as telemetry from 'zinc:telemetry';

const READINGS: i32 = 3;

function section(title: string): void {
  console.log('');
  console.log(title);
  console.log('-'.repeat(title.length));
}

function identify(): void {
  section('The device');
  console.log('serial', Sensor.serial());      // a string built in C++, returned as a Zinc string
}

function readTemperature(): void {
  section('Readings');
  for (let i = 0; i < READINGS; i++) console.log('reading', Sensor.temperature());
}

function publish(): void {
  section('Telemetry');
  // native values plug into the rest of the program like any function (see `zinc monitor`)
  telemetry.expose('temperature', () => Sensor.temperature());
  console.log('temperature exposed', telemetry.enabled() ? '(streaming)' : '(set ZINC_TELEMETRY to stream it)');
  Sensor.setLed(true);                        // a void call with an argument
  console.log('status LED on');
}

identify();
readTemperature();
publish();
