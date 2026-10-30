// tests/t0/heap_trim.sh: a burst of objects (a large JSON document parsed, as a Discord READY) dropped, then the program idles. The
// memory the allocators held for it must go back to the system while it waits (ZN-885).
function burst(): number {
  const parts: string[] = [];
  for (let i = 0; i < 300000; i++) parts.push(`{"id":"${i}","name":"channel ${i}","topic":"the topic of channel ${i}, a sentence or two long"}`);
  const doc: any = JSON.parse(`[${parts.join(',')}]`);
  return doc.length;
}
console.log(`parsed ${burst()}`);
setTimeout(() => { console.log('idle'); }, 6000);
