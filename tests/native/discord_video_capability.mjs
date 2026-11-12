// Execute the production TypeScript under Node with only imported providers replaced; no sockets, devices or timers run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const source = readFileSync('plugins/discord-voice/index.ts','utf8');
assert.equal((source.match(/^import .*;$/gm)||[]).length,4);
const js = stripTypeScriptTypes(source.replace(/^import .*;$/gm,'')).replace(/^export /gm,'');
for (const available of [false,true]) {
  const sockets=[], timers=new Map(), native=[], logs=[];
  let next=0, queries=0, acceptImage=true;
  const S=new Proxy({videoAvailable(){queries++;return available;},daveVersion(){return 0;},connect(){return 1;},discovered(){return '127.0.0.1\u001f8000';},modes(){return 'test';},start(){return true;},sendImage(...args){native.push(['sendImage',...args]);return acceptImage;},videoSend(...args){native.push(['videoSend',...args]);},watch(...args){native.push(['watch',...args]);}}, {get:(target,key)=>key in target?target[key]:(...args)=>{native.push([key,...args]);}});
  class WebSocket {
    sent=[];
    constructor(url){this.url=url;sockets.push(this);}
    send(text){this.sent.push(JSON.parse(text));}
    sendBytes(){assert.fail('unexpected binary DAVE message');}
    close(){this.closed=true;}
    message(op,d){this.onmessage({binary:false,data:JSON.stringify({op,d})});}
  }
  const context=vm.createContext({S,WebSocket,env:()=>'',console,Map,Set,Date,Math,JSON,Error,
    setInterval(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearInterval(id){timers.delete(id);},
    setTimeout(){assert.fail('unexpected reconnect or delayed video');},clearTimeout(){}});
  vm.runInContext(js+'\nglobalThis.api={VoiceConnection,isVideoSupported};',context);
  assert.equal(queries,0,'pure imports must not query native video');
  const {VoiceConnection,isVideoSupported}=context.api;
  assert.equal(isVideoSupported(),available);
  const server={endpoint:'wss://not-contacted.invalid',token:'test',serverId:'1',userId:'2',sessionId:'3',channelId:'4'};
  if (!available) {assert.throws(()=>new VoiceConnection({...server,stream:true}),/H.264.*not available/);assert.equal(sockets.length,0);}
  const c=new VoiceConnection(server), ws=sockets[0]; c.log=line=>logs.push(line);ws.onopen();
  const identify=ws.sent.find(m=>m.op===0).d;
  assert.equal(identify.video,available);assert.equal(identify.streams.length,available?1:0);
  ws.message(2,{ssrc:10,streams:[{ssrc:20,rtx_ssrc:21,type:'video'}],modes:['test'],ip:'127.0.0.1',port:8000});
  for (const {fn,ms} of [...timers.values()]) if(ms===10)fn();
  const codecs=ws.sent.find(m=>m.op===1).d.codecs;
  assert.equal(codecs[0].name,'opus');assert.equal(codecs.length,available?2:1);
  if(available){assert.equal(codecs[1].name,'H264');assert.equal(codecs[1].encode,true);assert.equal(codecs[1].decode,true);}
  ws.message(4,{mode:'test',secret_key:Array(32).fill(0)});
  assert.equal(c.state,'connected');
  ws.message(12,{user_id:'peer',streams:[{ssrc:30,rtx_ssrc:31,quality:100,type:'video'}]});
  assert.equal(c.watch(new Map([['peer',[640,360]]])),available);
  const watch=native.filter(row=>row[0]==='watch').at(-1);
  assert.equal(watch[4],available?640:0);assert.equal(watch[5],available?360:0);
  const wants=ws.sent.filter(m=>m.op===15).at(-1).d;
  assert.equal(wants['30'],available?100:0);
  if(available){c.setCamera(true);assert.equal(c.sendImage(42),true);acceptImage=false;assert.equal(c.sendImage(42),false);}
  else {assert.throws(()=>c.setCamera(true),/H.264.*not available/);assert.equal(c.sendImage(42),false);assert.equal(logs.some(s=>s.includes('H.264')),true);}
  assert.equal(c.state,'connected','video refusal must preserve audio');
  assert.equal(ws.sent.some(m=>m.op===12&&m.d.streams.length>0),available);
  c.setCamera(false);assert.equal(c.watch(new Map()),true);assert.equal(c.sendImage(42),false);
  assert.equal(native.filter(row=>row[0]==='videoSend').at(-1)[2],0,'stop is always allowed');
  assert.equal(native.some(row=>row[0]==='watch'&&row[4]>0),available);
  c.close();assert.equal(c.state,'closed');assert.equal(ws.closed,true);assert.equal(timers.size,0);
}
console.log('PASS actual Discord source: lazy capability, Identify/codecs, camera/watch refusal, audio continuity and cleanup');
