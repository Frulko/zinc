function reject(f: () => void): void { let caught = false; try { f(); } catch (e) { caught = e.name === 'RangeError'; } if (!caught) throw new Error('unsupported option accepted'); }
reject(()=>{new Intl.NumberFormat('en-US',{style:'percent'});});
reject(()=>{new Intl.NumberFormat('en-US',{maximumFractionDigits:21});});
reject(()=>{new Intl.NumberFormat('en-US',{maximumSignificantDigits:3});});
reject(()=>{(42).toLocaleString('en-US',{notation:'scientific'});});
reject(()=>{new Intl.DateTimeFormat('en-US',{dateStyle:'long'});});
reject(()=>{new Date(0).toLocaleDateString('en-US',{era:'long'});});
console.log('unsupported options rejected');
