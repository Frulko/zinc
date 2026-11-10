import { backend, supports, call, on, requestClose, preventClose, SystemError } from 'zinc:system';
import { OpenOptions, open } from 'zinc:system/dialog';
import { equal, ok } from 'zinc:assert';
ok(typeof backend === 'string' && backend.length > 0,'legacy backend stays a string');ok(supports('dialogs'));
let denied=false;
try { call('tray.create',{id:'not-permitted'}); } catch(error) { denied=error instanceof SystemError && (error as SystemError).code==='denied'; }
ok(denied,'native permission refusal preserves SystemError');
let closed:i32=0;
const dispose=on('window',(args:string[])=>{closed++;preventClose();});
ok(!requestClose());equal(closed,1);dispose();dispose();ok(requestClose());equal(closed,1);
const again=on('window',(args:string[])=>{closed++;preventClose();});ok(!requestClose());equal(closed,2);again();
const options=new OpenOptions();options.title='Scoped fixture';
open(options).then((paths:string[]|null)=>{equal(paths,null,'simulated existing picker is cancellable');console.log('extended System API: ok');});
