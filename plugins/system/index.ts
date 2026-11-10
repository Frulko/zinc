// Compatibility entry: importing backend preserves its public string contract.
// Feature modules and event consumers use the lazy core directly.
import { backendName } from './core';
export { SystemError, supports, call, callRaw, preventClose, requestClose, on, quit, selftest } from './core';
export const backend: string = backendName();
