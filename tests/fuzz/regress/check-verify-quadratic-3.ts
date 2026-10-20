// Date against the answers of Node, in whatever zone TZ names (tests/t1/date_zones.sh runs it in UTC, America/New_York, Europe/Paris and Asia/Kolkata and compares with
// tests/golden/run/date_full.<zone>.out made by Node).
const out: string[] = [];
function show(label: string, v: unknown): void { out.push(label + ' ' + JSON.stringify(v)); }
function iso(d: Date): string { const v = d.getTime(); return v - v === 0 ? d.toISOString() : "Invalid"; }
const jan = new Date(2020, 0, 15, 10, 30, 45, 123);
const jul = new Date(2020, 6, 15, 10, 30, 45, 123);
show('ctor parts', [iso(jan), iso(jul), jan.getTimezoneOffset(), jul.getTimezoneOffset()]);
show('ctor forms', [iso(new Date(0)), iso(new Date(1e12)), iso(new Date(2020, 11)), iso(new Date(99, 0)), iso(new Date(100, 0)), iso(new Date(2020, 0, 1, 25, 61, 61, 1001)), iso(new Date(2020, 12, 32)), iso(new Date(NaN)), iso(new Date(8.64e15)), iso(new Date(8.64e15 + 1))]);
show('ctor string', [iso(new Date('2020-01-15')), iso(new Date('2020-01-15T10:00:00')), iso(new Date('2020-01-15T10:00:00Z')), iso(new Date('2020-01-15T10:00:00+05:30')), iso(new Date('2020-01-15T10:00:00.5Z')), iso(new Date('2020-01')), iso(new Date('2020')), iso(new Date('+020000-01-01T00:00:00Z')), iso(new Date('2020-02-30')), iso(new Date('garbage'))]);
show('parse legacy', ['Tue, 15 Nov 1994 08:12:31 GMT', 'Jan 15, 2020 10:00:00', '15 January 2020', 'January 15, 2020', '1/15/2020', '2020/01/15', 'Wed Jan 15 2020 10:30:45 GMT+0100', 'Jan 15 2020 10:30 PM', 'Thu, 01 Jan 1970 00:00:00 GMT', 'Dec 25, 1995', '12/25/95'].map((s) => Date.parse(s)));
show('UTC', [Date.UTC(2000, 0, 1), Date.UTC(99, 11, 31, 23, 59, 59, 999), Date.UTC(2020, 1, 30), Date.UTC(1970), Date.UTC(-1, 0), Date.UTC(275760, 8, 13), Date.UTC(275760, 8, 14)]);
const d = new Date(Date.UTC(2020, 0, 31, 12, 0, 0, 0));
show('fields', [d.getFullYear(), d.getMonth(), d.getDate(), d.getDay(), d.getHours(), d.getUTCHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds(), d.getUTCDay()]);
const s = new Date(Date.UTC(2020, 0, 31, 12, 0, 0, 0));
s.setMonth(1); show('setMonth', iso(s));
s.setDate(0); show('setDate 0', iso(s));
s.setFullYear(2021, 5, 15); show('setFullYear', iso(s));
s.setHours(25, 70, 70, 1100); show('setHours', iso(s));
s.setMinutes(-1); show('setMinutes', iso(s));
s.setSeconds(90, 5); show('setSeconds', iso(s));
s.setMilliseconds(-1); show('setMilliseconds', iso(s));
s.setUTCDate(1); s.setUTCHours(0, 0, 0, 0); show('setUTC', iso(s));
show('setTime', [new Date(5).setTime(10), new Date(5).setTime(NaN), new Date(NaN).setFullYear(2000) === new Date(2000, 0, 1).getTime()]);
// DST: gaps and overlaps of the zones under test
show('dst', [iso(new Date(2020, 2, 8, 2, 30)), iso(new Date(2020, 10, 1, 1, 30)), iso(new Date(2020, 2, 29, 2, 30)), iso(new Date(2020, 9, 25, 2, 30)), iso(new Date(2020, 2, 8, 12)), iso(new Date(2020, 2, 7, 12))]);
show('offsets', [new Date(2020, 2, 8, 12).getTimezoneOffset(), new Date(2020, 2, 7, 12).getTimezoneOffset(), new Date(1900, 0, 1).getTimezoneOffset(), new Date(-1e13).getTimezoneOffset()]);
const t = new Date(Date.UTC(2020, 6, 4, 15, 5, 9, 7));
show('strings', [t.toString(), t.toDateString(), t.toTimeString(), t.toUTCString(), t.toISOString(), t.toJSON(), t.toLocaleString(), t.toLocaleDateString(), t.toLocaleTimeString()]);
show('locale zone', [t.toLocaleString('en-US', { timeZone: 'UTC' }), t.toLocaleDateString('en-US', { timeZone: 'Asia/Tokyo' }), t.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })]);
show('strings 2', [new Date(Date.UTC(1969, 11, 31, 23, 59, 59, 999)).toString(), new Date(Date.UTC(-1, 0, 1)).toISOString(), new Date(Date.UTC(10000, 0, 1)).toISOString(), new Date(NaN).toString(), new Date(NaN).toJSON(), new Date(Date.UTC(5, 0, 1)).toUTCString()]);
show('template', `${new Date(0)}`);
show('arith', [new Date(1000).getTime() - new Date(400).getTime(), new Date(2020, 0, 1) < new Date(2020, 0, 2), new Date(5).valueOf() + 1]);
try { new Date(NaN).toISOString(); } catch (e) { show('invalid iso', (e as Error).name); }
for (const line of out) console.log(line);
