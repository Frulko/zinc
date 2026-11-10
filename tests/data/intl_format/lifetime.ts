function numberCallback(): (value: number) => string { const f = new Intl.NumberFormat('en-US', {maximumFractionDigits:2}); return f.format; }
function dateCallback() { const f = new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}); return f.format; }
for (let i = 0; i < 200; i++) {
  let rejected = false;
  try { new Intl.DateTimeFormat('en-US',{timeZone:null}); } catch { rejected = true; }
  if (!rejected) throw new Error('null timezone accepted');
  const n = numberCallback(), d = dateCallback();
  if (n(1.005) !== '1.01' || d(0) !== 'January') throw new Error('bound formatter lost settings');
}
console.log('bound formatters released');
