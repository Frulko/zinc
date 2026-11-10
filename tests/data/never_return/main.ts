function unused(): never { throw new Error('unused'); }
function fail(message: string): never { throw new Error(message); }
function terminal(): never { fail('terminal'); }
function numeric(): number { return fail('return'); }
function choose(ok: boolean): number { return ok ? 42 : fail('branch'); }
function union(value: number | never): number { return value; }
function forward(value: never): never { return value; }
function initializerEnd(): never { const value = fail('initializer end'); }
function branchEnd(ok: boolean): never { ok ? fail('left end') : fail('right end'); }
class Base { f(): number { return 1; } }
class Derived extends Base { f(): never { throw new Error('base override'); } }
interface Contract { f(): number; }
class Implemented implements Contract { f(): never { throw new Error('interface override'); } }
interface ArgumentContract { f(value: number): number; }
class FewerArgs implements ArgumentContract { f(): never { throw new Error('fewer args'); } }
function viaArgs(value: ArgumentContract): number { return value.f(42); }
function viaBase(value: Base): number { return value.f(); }
function viaInterface(value: Contract): number { return value.f(); }
interface Stopping { stop(): never; }
class Stopper implements Stopping { stop(): never { throw new Error('method'); } }
class OtherStopper implements Stopping { stop(): never { throw new Error('virtual'); } }
function invoke(value: Stopping): void { value.stop(); }
function closure(message: string): () => never { return (): never => { throw new Error(message); }; }
try { console.log(viaBase(new Derived())); } catch (e) { console.log(e.message); } finally { console.log('base finally'); }
try { console.log(viaInterface(new Implemented())); } catch (e) { console.log(e.message); } finally { console.log('interface finally'); }
try { console.log(viaArgs(new FewerArgs())); } catch (e) { console.log(e.message); }
const stop = closure('closure');
const numberFromStop: () => number = stop;
try { fail('direct'); console.log('unreachable direct'); } catch (e) { console.log(e.message); } finally { console.log('finally'); }
try { initializerEnd(); } catch (e) { console.log(e.message); }
try { branchEnd(false); } catch (e) { console.log(e.message); }
try { terminal(); console.log('unreachable terminal'); } catch (e) { console.log(e.message); }
try { numeric(); } catch (e) { console.log(e.message); }
console.log(choose(true), union(7));
try { console.log(choose(false)); } catch (e) { console.log(e.message); }
try { stop(); console.log('unreachable closure'); } catch (e) { console.log(e.message); }
try { numberFromStop(); } catch (e) { console.log('adapted', e.message); }
try { new Stopper().stop(); console.log('unreachable method'); } catch (e) { console.log(e.message); }
try { invoke(new OtherStopper()); } catch (e) { console.log(e.message); }
try { const value: number = fail('initializer'); console.log(value); } catch (e) { console.log(e.message); }
try { const value: number = false ? fail('left') : fail('right'); console.log(value); } catch (e) { console.log(e.message); }
class Uninhabited { value!: never; values: never[] = []; }
const holder = new Uninhabited();
console.log('slots', holder.values.length);
const empty: never[] = [];
console.log('empty', empty.length);
const resolvers = Promise.withResolvers();
resolvers.promise.then((value: never): void => {}, (e: Error): void => { console.log('resolver', e.message); });
resolvers.reject(new Error('rejected'));
const rejected: Promise<never> = Promise.reject(new Error('typed'));
rejected.then((value: never): void => {}, (e: Error): void => { console.log('promise', e.message); });
