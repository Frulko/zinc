import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { f(): void }
const n = requireNative<Spec>('Nowhere');
