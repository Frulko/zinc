import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { f(m: Map<string, i32>): void }
const n = requireNative<Spec>('Fixture');
