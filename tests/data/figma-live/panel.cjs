const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {dataset:{},focus(){}});
  return elements.get(id);
}
const context = vm.createContext({document:{getElementById:element},parent:{postMessage(){}},window:{},URL,Date,setInterval(){}});
const html = fs.readFileSync('integrations/figma/ui.html','utf8');
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
// Figma's sandbox relay can deliver a message with no direct-parent source.
context.window.onmessage({source:null,data:{pluginMessage:{type:'selection',name:'Screen',pinned:''}}});
assert.equal(element('start').disabled,false);
assert.equal(element('screen').textContent,'Screen');
context.window.onmessage({source:null,data:{pluginMessage:{type:'error',message:'Useful error'}}});
assert.equal(element('status').textContent,'Useful error');
assert.equal(element('status').dataset.error,'true');
assert.equal(element('pause').hidden,true);
context.window.onmessage({source:null,data:null});
