import { Script } from 'zinc:script';
import { equal } from 'zinc:assert';
const script = new Script({});
try {
  equal(String(script.eval("const m=new Map([['key',1]]); const it=m.values(); m.set('next',2); it.next().value===1 && it.next().value===2 && !Array.isArray(m.values()) && typeof m.values().length==='undefined'")), 'true');
} finally { script.dispose(); }
console.log('embedded collections: pass');
