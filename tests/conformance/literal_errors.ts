// zinc-test: gradual
interface Box { value: i32; }
function fail(): i32 { throw new Error('literal'); }
function objectInVoid(): void { const value: Box = { value: fail() }; console.log('unreachable', value.value); }
function objectReturn(): Box { return { value: fail() }; }
function spreadInVoid(): void { const base: i32[] = [1]; const value: i32[] = [...base, fail()]; console.log('unreachable', value.length); }
function dynamicInVoid(): void { const value: any = { value: fail() }; console.log('unreachable', value); }
try { objectInVoid(); } catch (e) { console.log('object void', e.message); }
try { objectReturn(); } catch (e) { console.log('object return', e.message); }
try { spreadInVoid(); } catch (e) { console.log('spread void', e.message); }
try { dynamicInVoid(); } catch (e) { console.log('dynamic void', e.message); }
try { const value: Box = { value: fail() }; console.log('unreachable', value.value); } catch (e) { console.log('object catch', e.message); }
try { const value: i32[] = [...[1], fail()]; console.log('unreachable', value.length); } catch (e) { console.log('spread catch', e.message); }
try { const value: any = { value: fail() }; console.log('unreachable', value); } catch (e) { console.log('dynamic catch', e.message); }
