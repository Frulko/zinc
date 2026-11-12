// ZnVal on wasm32 is 8 bytes (pointer + length overlays the scalar), unlike the 24-byte HostArg.
const LIMIT = 4 * 1024 * 1024;
const encoder = new TextEncoder(), decoder = new TextDecoder();
export function nativeSignature(sig) {
  if (typeof sig !== 'string' || !/^[siubdfBIUDS]{0,12}>[nsiubdfBID]$/.test(sig)) throw new Error('unsupported browser native signature: ' + sig);
  return sig.split('>');
}
function validArgument(type, value) {
  if (type === 'n') return true;
  if (type === 's') return typeof value === 'string' && value.length <= LIMIT;
  if (type === 'b') return typeof value === 'boolean';
  if ('iudf'.includes(type)) return typeof value === 'number' && Number.isFinite(value) && (type === 'd' || type === 'f' && Number.isFinite(Math.fround(value)) || (type === 'i' || type === 'u') && Number.isInteger(value) && value >= (type === 'u' ? 0 : -2147483648) && value <= (type === 'u' ? 4294967295 : 2147483647));
  const width = type === 'B' ? 1 : type === 'I' || type === 'U' ? 4 : 8;
  return (Array.isArray(value) || ArrayBuffer.isView(value)) && Number.isInteger(value.length) && value.length <= LIMIT / width && Array.from(value).every(v => type === 'S' ? typeof v === 'string' : validArgument(type === 'D' ? 'd' : type === 'U' ? 'u' : 'i', v) && (type !== 'B' || v >= 0 && v <= 255));
}
function transported(type, value) {
  if (type === 'n') return undefined;
  if (!validArgument(type,value)) throw new Error('invalid browser native value');
  return 'BIUD'.includes(type) ? Array.from(value) : value;
}
export class NativeABI {
  constructor(memory, exports) { this.memory = memory; this.exports = exports; this.result = 0; }
  view() { return new DataView(this.memory().buffer); }
  range(p, n, width = 1) {
    const size = this.memory().buffer.byteLength;
    if (!Number.isSafeInteger(p) || !Number.isSafeInteger(n) || p < 0 || n < 0 || n > LIMIT / width || p > size || n > (size - p) / width) throw new Error('browser native value exceeds memory or transport bounds');
    return p;
  }
  string(p, n) { this.range(p, n); return decoder.decode(new Uint8Array(this.memory().buffer, p, n)); }
  cstr(p) {
    this.range(p, 1);
    const bytes = new Uint8Array(this.memory().buffer); let end = p;
    while (end < bytes.length && end - p < 4096 && bytes[end]) end++;
    if (end === bytes.length || end - p === 4096) throw new Error('unterminated browser native name');
    return this.string(p, end - p);
  }
  preflight(type, ptr, budget) {
    this.range(ptr, 8); const v = this.view();
    const take = bytes => { if (bytes > budget.left) throw new Error('browser native arguments exceed transport bounds'); budget.left -= bytes; };
    if ('iubdf'.includes(type)) { take(8); return; }
    const p = v.getUint32(ptr,true), n = v.getUint32(ptr+4,true);
    if (type === 's') { this.range(p,n); take(n); return; }
    const width = type === 'B' ? 1 : type === 'I' || type === 'U' ? 4 : 8;
    this.range(p,n,width); take(n*width);
    if (type === 'S') for (let i=0;i<n;i++) {
      const text = v.getUint32(p+i*8,true), bytes = v.getUint32(p+i*8+4,true);
      this.range(text,bytes); take(bytes);
    }
  }
  read(type, ptr) {
    this.preflight(type,ptr,{left:LIMIT});
    return this.value(type,ptr);
  }
  value(type, ptr) {
    const v = this.view();
    if (type === 'i') return Number(v.getBigInt64(ptr, true)) | 0;
    if (type === 'u') return Number(v.getBigUint64(ptr, true)) >>> 0;
    if (type === 'b') return v.getBigInt64(ptr, true) !== 0n;
    if (type === 'd' || type === 'f') return v.getFloat64(ptr, true);
    const p = v.getUint32(ptr, true), n = v.getUint32(ptr + 4, true);
    if (type === 's') return this.string(p, n);
    if (type === 'S') return Array.from({length:n}, (_, i) => this.value('s', p + i * 8));
    return Array.from({length:n}, (_, i) => type === 'B' ? v.getUint8(p+i) : type === 'I' ? v.getInt32(p+i*4,true) : type === 'U' ? v.getUint32(p+i*4,true) : v.getFloat64(p+i*8,true));
  }
  args(sig, ptr) {
    const [params] = nativeSignature(sig); this.range(ptr, params.length, 8);
    const budget = {left:LIMIT};
    [...params].forEach((type,i)=>this.preflight(type,ptr+i*8,budget));
    const values = [...params].map((c, i) => this.value(c, ptr+i*8));
    if (![...params].every((type,i)=>validArgument(type,values[i]))) throw new Error('invalid browser native argument');
    if (encoder.encode(JSON.stringify(values)).length > LIMIT) throw new Error('browser native arguments exceed transport bounds');
    return values;
  }
  write(type, ptr, value) { this.complete('>'+type,0,ptr,{value,outputs:[]}); }
  complete(sig, args, ret, reply) {
    const [params,result] = nativeSignature(sig);
    this.range(args,params.length,8); this.range(ret,8);
    if (params.length && ret < args + params.length*8 && args < ret+8) throw new Error('overlapping browser native descriptors');
    if (!reply || typeof reply !== 'object' || !Array.isArray(reply.outputs) || reply.outputs.length !== params.length) throw new Error('invalid browser native reply');
    const items = [], budget = {left:LIMIT};
    let length = 0;
    const prepare = (type,ptr,value) => {
      if (!validArgument(type,value)) throw new Error('invalid browser native result or output');
      if (type === 'n') return;
      let bytes = null, n = 0;
      if (type === 's') { if (value.length > budget.left) throw new Error('browser native reply exceeds transport bounds'); bytes = encoder.encode(value); n = bytes.length; }
      else if ('BIUD'.includes(type)) {
        n = value.length; const width = type === 'B' ? 1 : type === 'D' ? 8 : 4;
        if (n*width > budget.left) throw new Error('browser native reply exceeds transport bounds');
        bytes = new Uint8Array(n*width); const v = new DataView(bytes.buffer);
        for (let i=0;i<n;i++) {
          if (type === 'B') v.setUint8(i,value[i]);
          else if (type === 'I') v.setInt32(i*4,value[i],true);
          else if (type === 'U') v.setUint32(i*4,value[i],true);
          else v.setFloat64(i*8,value[i],true);
        }
      }
      budget.left -= bytes ? bytes.length : 8;
      if (budget.left < 0) throw new Error('browser native reply exceeds transport bounds');
      const offset = Math.ceil(length/8)*8;
      if (bytes) length = offset + Math.max(1,bytes.length + (type === 's' ? 1 : 0));
      items.push({type,ptr,value,bytes,n,offset});
    };
    prepare(result,ret,reply.value);
    [...params].forEach((type,i) => {
      if ('BIUD'.includes(type) && reply.outputs[i] !== null) prepare(type,args+i*8,reply.outputs[i]);
      else if (reply.outputs[i] !== null) throw new Error('invalid browser native output slot');
    });
    let allocation = 0, base = 0;
    try {
      if (length) {
        allocation = this.exports.zn_alloc(length+7);
        if (!allocation) throw new Error('browser native reply allocation failed');
        this.range(allocation,1);
        if (length+7 > this.memory().buffer.byteLength-allocation) throw new Error('browser native reply allocation exceeds memory bounds');
        base = Math.ceil(allocation/8)*8;
        if (base < ret+8 && ret < base+length || params.length && base < args+params.length*8 && args < base+length) throw new Error('browser native reply overlaps descriptors');
        // Allocation may grow memory: acquire views only after it completes.
        for (const item of items) if (item.bytes) {
          new Uint8Array(this.memory().buffer,base+item.offset,item.bytes.length).set(item.bytes);
          if (item.type === 's') this.view().setUint8(base+item.offset+item.bytes.length,0);
        }
      }
      const v = this.view();
      for (const item of items) {
        if (item.bytes) { v.setUint32(item.ptr,base+item.offset,true); v.setUint32(item.ptr+4,item.n,true); }
        else if (item.type === 'd' || item.type === 'f') v.setFloat64(item.ptr,item.type === 'f' ? Math.fround(item.value) : item.value,true);
        else v.setBigInt64(item.ptr,BigInt(item.type === 'b' ? +item.value : item.value),true);
      }
    } catch (error) { if (allocation) this.exports.zn_free(allocation); throw error; }
    if (this.result) this.exports.zn_free(this.result);
    this.result = allocation;
  }
  close() { if (this.result) this.exports.zn_free(this.result); this.result = 0; }
  error(ptr, size, error) {
    if (!size) return;
    this.range(ptr, size);
    const bytes = encoder.encode(String(error?.message || error)).subarray(0, size - 1);
    new Uint8Array(this.memory().buffer, ptr, bytes.length).set(bytes); this.view().setUint8(ptr+bytes.length,0);
  }
}

// Shared replies also serve the blocking fallback: the worker cannot receive messages inside Atomics.wait.
const Reply = Object.freeze({ Pending:0, Writing:1, Ready:2, Cancelled:3 });
export class NativeRPC {
  constructor(send, timeout = 15000) { this.send = send; this.timeout = timeout; this.next = 0; this.pending = new Map(); this.state = 'ready'; }
  close() {
    if (this.state === 'closed') return;
    this.state = 'closed';
    for (const {header, reject} of this.pending.values()) { Atomics.compareExchange(header,0,Reply.Pending,Reply.Cancelled); reject?.(new Error('browser native worker closed')); }
    this.pending.clear();
  }
  reply(id) { this.pending.get(id)?.resolve(); }
  call(module, name, sig, args, blocking) {
    if (this.state !== 'ready') throw new Error('browser native worker closed');
    const deadline = Date.now() + this.timeout;
    const id = ++this.next, buffer = new SharedArrayBuffer(LIMIT + 16), header = new Int32Array(buffer,0,4);
    const read = () => {
      this.pending.delete(id);
      if (Atomics.load(header,0) !== Reply.Ready) { Atomics.compareExchange(header,0,Reply.Pending,Reply.Cancelled); throw new Error('browser native response timed out'); }
      const length = Atomics.load(header,1);
      if (length < 0 || length > LIMIT) throw new Error('invalid browser native response size');
      const result = JSON.parse(decoder.decode(new Uint8Array(buffer,16,length).slice()),(_,value)=>value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && value.$znNativeFloat === '-0' ? -0 : value);
      if (result.error) throw new Error(result.error);
      return result;
    };
    if (blocking) {
      this.pending.set(id,{header}); this.send({nativeCall:{id,module,name,sig,args,buffer}});
      Atomics.wait(header,0,Reply.Pending,this.timeout);
      // A writer owns a bounded memory copy; wait for its publication too, within the same deadline.
      if (Atomics.load(header,0) === Reply.Writing) Atomics.wait(header,0,Reply.Writing,Math.max(0,deadline-Date.now()));
      return read();
    }
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { try { resolve(read()); } catch (e) { reject(e); } },this.timeout);
      this.pending.set(id,{header,reject:(e)=>{clearTimeout(timer);reject(e);},resolve:()=>{clearTimeout(timer);try{resolve(read());}catch(e){reject(e);}}});
      this.send({nativeCall:{id,module,name,sig,args,buffer}});
    });
  }
}
export function nativeDeclarations(Z, declarations) {
  return declarations.filter(([module,name,sig]) => {
    nativeSignature(sig);
    const entry = Z.nativeOf(module);
    return !!entry && Object.hasOwn(entry.impl,name) && typeof entry.impl[name] === 'function';
  });
}
export async function serveNative(Z, declarations, call, send) {
  const {id,module,name,sig,args,buffer} = call;
  if (!(buffer instanceof SharedArrayBuffer) || buffer.byteLength !== LIMIT + 16) return;
  const header = new Int32Array(buffer,0,4);
  if (Atomics.load(header,0) !== Reply.Pending) return;
  let result;
  try {
    if (!declarations.some(d=>d[0]===module && d[1]===name && d[2]===sig)) throw new Error('browser native export or signature is not available');
    const [params,ret] = nativeSignature(sig);
    if (!Array.isArray(args) || args.length !== params.length || ![...params].every((type,i)=>validArgument(type,args[i])) || encoder.encode(JSON.stringify(args)).length > LIMIT) throw new Error('invalid browser native arguments');
    const entry = Z.nativeOf(module);
    for (const feature of entry.needs) Z.require(feature,module+'.'+name);
    const before = [...params].map((type,i)=>'BIUD'.includes(type) ? Array.from(args[i]) : null);
    const value = await entry.impl[name](...args);
    const outputs = [...params].map((type,i) => {
      if (!'BIUD'.includes(type)) return null;
      if (!validArgument(type,args[i])) throw new Error('invalid browser native output');
      return args[i].length === before[i].length && before[i].every((v,k)=>type === 'D' ? Object.is(v,args[i][k]) : v === args[i][k]) ? null : args[i];
    });
    const values = [[ret,value],...[...params].flatMap((type,i)=>outputs[i] !== null ? [[type,outputs[i]]] : [])];
    let bytes = 0;
    for (const [type,item] of values) {
      if (!validArgument(type,item)) throw new Error('invalid browser native result or output');
      bytes += type === 's' ? encoder.encode(item).length : 'BIUD'.includes(type) ? item.length*(type === 'B' ? 1 : type === 'D' ? 8 : 4) : type === 'n' ? 0 : 8;
      if (bytes > LIMIT) throw new Error('browser native reply exceeds transport bounds');
    }
    result = {value:transported(ret,value),outputs:[...params].map((type,i)=>outputs[i] !== null ? transported(type,outputs[i]) : null)};
  } catch (error) { result = {error:String(error?.message || error)}; }
  let bytes;
  // JSON otherwise erases the sign of zero in scalar results and numeric outputs.
  try { bytes = encoder.encode(JSON.stringify(result,(_,value)=>Object.is(value,-0) ? {$znNativeFloat:'-0'} : value)); }
  catch { bytes = encoder.encode(JSON.stringify({error:'browser native result cannot be transported'})); }
  if (bytes.length > LIMIT) bytes = encoder.encode(JSON.stringify({error:'browser native result exceeds transport bounds'}));
  if (Atomics.compareExchange(header,0,Reply.Pending,Reply.Writing) !== Reply.Pending) return;
  new Uint8Array(buffer,16,bytes.length).set(bytes); Atomics.store(header,1,bytes.length);
  Atomics.store(header,0,Reply.Ready); Atomics.notify(header,0); send({nativeReply:id});
}
