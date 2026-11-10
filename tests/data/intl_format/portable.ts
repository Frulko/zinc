function show(value: any): void { console.log(JSON.stringify(value)); }
const n = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
show([n.format(1.005),n.format(-0),n.format(1e21),n.format(NaN),n.format(Infinity)]);
const d = new Date(Date.UTC(2024,0,2,15,4,5));
show([d.toLocaleString('en-US',{timeZone:'UTC'}),d.toLocaleDateString('en-US',{month:'long',timeZone:'UTC'}),new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(d)]);
