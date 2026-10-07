import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { add(a: f64, b: f64): f64 }
const n = requireNative<Spec>('Fixture');
