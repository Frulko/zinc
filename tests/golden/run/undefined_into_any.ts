// `undefined` passed from a file without `any` to a function of another module that takes `any` stays undefined, not null (ZN-890)
import { kind } from './modules/dyn_kind';
import * as m from './modules/dyn_kind';
console.log(kind(undefined), kind(null), m.kind(undefined), m.kind(3));
