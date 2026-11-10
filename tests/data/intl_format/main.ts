// Node 26.5.0 / ICU 78.3 oracle: explicit locales and zones make the accepted subset reproducible.
function show(value: any): void { console.log(JSON.stringify(value)); }
const numbers: number[] = [0, -0, NaN, Infinity, -Infinity, 1.005, -1.005, 1.255, 999.9996, 1e21, 1e-7, 1234567.891];
const en = new Intl.NumberFormat('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
const fr = new Intl.NumberFormat('fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2});
for (let i = 0; i < numbers.length; i++) show([en.format(numbers[i]), fr.format(numbers[i]), numbers[i].toLocaleString('fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2})]);
show([new Intl.NumberFormat('en-US').format(1234.5), new Intl.NumberFormat('en-US', {useGrouping:false, maximumFractionDigits:1}).format(1234.56), new Intl.NumberFormat('en-US', {minimumFractionDigits:4}).format(1.2)]);
const no = {maximumFractionDigits:1};
const savedNumber = new Intl.NumberFormat('en-US', no).format;
no.maximumFractionDigits = 0;
show([savedNumber(1.26), savedNumber === savedNumber]);
const nr = en.resolvedOptions();
show([nr.locale,nr.numberingSystem,nr.style,nr.minimumIntegerDigits,nr.minimumFractionDigits,nr.maximumFractionDigits,nr.useGrouping,nr.notation,nr.signDisplay,nr.roundingMode,nr.roundingPriority,nr.roundingIncrement,nr.trailingZeroDisplay]);
show(new Intl.NumberFormat('en-US', {useGrouping:false}).resolvedOptions().useGrouping);
show(Intl.NumberFormat.supportedLocalesOf(['zz-ZZ','fr-FR','en-US','fr-FR']));
show(new Intl.NumberFormat(['zz-ZZ','fr-FR']).resolvedOptions().locale);
show(new Intl.NumberFormat('zz-ZZ').resolvedOptions().locale);
const t = Date.UTC(2024, 0, 2, 15, 4, 5);
const date = new Date(t);
show([date.toLocaleDateString('fr-FR',{month:'long',timeZone:'UTC'}), date.toLocaleDateString('en-US',{month:'long',timeZone:'UTC'})]);
show([date.toLocaleDateString('en-US',{timeZone:'UTC'}), date.toLocaleTimeString('en-US',{timeZone:'UTC'}), date.toLocaleString('en-US',{timeZone:'UTC'})]);
show([date.toLocaleDateString('fr-FR',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}), date.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})]);
show([new Intl.DateTimeFormat('en-US',{timeZone:'UTC'}).format(t), new Intl.DateTimeFormat('fr-FR',{month:'long',timeZone:'UTC'}).format(date)]);
const dt = new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',hour:'numeric',minute:'numeric',second:'numeric',hour12:false,timeZone:'UTC'});
show(dt.format(t));
const dr = dt.resolvedOptions();
show([dr.locale,dr.calendar,dr.numberingSystem,dr.timeZone,dr.year,dr.month,dr.day,dr.hour,dr.minute,dr.second,dr.hour12,dr.hourCycle]);
const savedDate = new Intl.DateTimeFormat('fr-FR',{month:'long',timeZone:'UTC'}).format;
show([savedDate(t),savedDate === savedDate]);
show([new Date(NaN).toLocaleDateString('fr-FR'), new Date(NaN).toLocaleTimeString(), new Date(NaN).toLocaleString()]);
show([new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'numeric',timeZone:'America/New_York'}).format(Date.UTC(2024,0,15,12)), new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'numeric',timeZone:'America/New_York'}).format(Date.UTC(2024,6,15,12))]);
show(Intl.DateTimeFormat.supportedLocalesOf(['zz-ZZ','fr-FR','en-US']));
function fails(f: () => void): string { try { f(); return 'accepted'; } catch (e) { return e.name; } }
show([fails(()=>{new Intl.NumberFormat('en_US');}),fails(()=>{new Intl.NumberFormat('en-US',{minimumFractionDigits:3,maximumFractionDigits:2});}),fails(()=>{new Intl.DateTimeFormat('en-US',{month:'bad'});}),fails(()=>{new Intl.DateTimeFormat('en-US',{timeZone:'Not/A_Zone'});}),fails(()=>{new Intl.DateTimeFormat('en-US').format(NaN);})]);

let defaultCalls = 0;
function nextDefault(): number { defaultCalls++; return 4; }
const defaulted = (value: any = nextDefault()): any => value;
show([defaulted(7),defaultCalls,defaulted(),defaultCalls]);

show([new Date(NaN).toLocaleDateString('en_US',{month:'bad'}),date.toLocaleDateString(['zz-ZZ','fr-FR'],{month:'long',timeZone:'UTC'}),fails(()=>{new Intl.NumberFormat('en-US\nfr-FR');})]);
const edge = new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:true,timeZone:'UTC'});
show([edge.format(t),edge.resolvedOptions().hour]);
const minute = new Intl.DateTimeFormat('en-US',{minute:'2-digit',timeZone:'UTC'});
show([minute.format(t),minute.resolvedOptions().minute]);

show([new Intl.NumberFormat('fr').resolvedOptions().locale,new Intl.DateTimeFormat('en',{hour:'numeric',timeZone:'UTC'}).format(t)]);

show([defaulted(null),defaultCalls,defaulted(undefined),defaultCalls]);

const weekday = new Intl.DateTimeFormat('en-US',{weekday:'short',month:'2-digit',timeZone:'UTC'}); show([weekday.format(t),weekday.resolvedOptions().weekday]);

console.log(JSON.stringify([en.resolvedOptions().locale,en.format(1234.5),date.toLocaleDateString('fr-FR',{month:'long',timeZone:'UTC'})]));
console.log(JSON.stringify(['before',en.resolvedOptions().locale,null,7]));

let order = '';
function firstCall(): string { order += 'a'; return 'A'; }
function dynamicCall(): any { order += 'b'; return 7; }
function lastCall(): number { order += 'c'; return 3; }
console.log(JSON.stringify([firstCall(),lastCall(),dynamicCall()])); show(order);

let numberOrder = '';
function numberReceiver(): number { numberOrder += 'n'; return 1; }
function numberLocale(): string { numberOrder += 'l'; return 'en-US'; }
function numberOptions(): NumberFormatOptions { numberOrder += 'o'; return {maximumFractionDigits:1}; }
show(numberReceiver().toLocaleString(numberLocale(),numberOptions())); show(numberOrder);
numberOrder = ''; show(fails(()=>{numberReceiver().toLocaleString(numberLocale(),{maximumFractionDigits:-1});})); show(numberOrder);
show([fails(()=>{new Intl.NumberFormat('');}),fails(()=>{new Intl.NumberFormat(['']);}),fails(()=>{new Intl.NumberFormat(null);}),fails(()=>{new Intl.DateTimeFormat('en-US',{timeZone:''});}),fails(()=>{new Intl.DateTimeFormat('en-US',{timeZone:null});}),fails(()=>{new Date(0).toLocaleDateString('');}),fails(()=>{new Date(0).toLocaleDateString(undefined,{timeZone:null});})]);
const nullZone: DateFormatOptions = {timeZone:null}, absentZone: DateFormatOptions = {timeZone:undefined};
show([fails(()=>{new Intl.DateTimeFormat('en-US',nullZone);}),new Intl.DateTimeFormat('en-US',absentZone).resolvedOptions().timeZone]);
show([new Intl.NumberFormat(undefined).resolvedOptions().locale,new Intl.NumberFormat([]).resolvedOptions().locale,Intl.NumberFormat.supportedLocalesOf([])]);

const changingDate = new Date(0);
function changingOptions(): DateFormatOptions { changingDate.setTime(86400000); return {timeZone:'UTC'}; }
show(changingDate.toLocaleDateString('en-US',changingOptions()));

const getterDate = new Date(0);
const getterOptions = { get month(): string { getterDate.setTime(86400000 * 32); return 'long'; }, timeZone:'UTC' };
show(getterDate.toLocaleDateString('en-US',getterOptions));

show(getterDate.getTime());

show([fails(()=>{Intl.NumberFormat.supportedLocalesOf(['']);}),fails(()=>{new Intl.DateTimeFormat('en-US',{month:'numeric|2-digit'});})]);
