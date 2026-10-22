// zinc:sketch — esp32-arduino's sketch, C++ on Arduino's core (native/sketch.abi.cpp), as TypeScript functions.
import N from './native/sketch.spec';

export function boots(): i32 { return N.boots(); }
export function chip(): string { return N.chip(); }
export function millis(): i32 { return N.millis(); }
export function loops(): i32 { return N.loops(); }
export function freeHeap(): i32 { return N.freeHeap(); }
