interface Settings { amount?: number; enabled?: boolean; }
function show(settings?: Settings): void {
  console.log('settings', settings?.amount ?? 9, settings?.enabled ?? true,
    settings?.amount === undefined, settings?.enabled !== undefined);
}
const missing: Settings = {};
const zeros: Settings = { amount: 0, enabled: false };
const values: Settings = { amount: 12, enabled: true };
show(); show(missing); show(zeros); show(values);
missing.amount = 0;
missing.enabled = false;
show(missing);
let visits: i32 = 0;
function source(): Settings { visits++; return zeros; }
console.log('once', source().amount ?? 7, source().enabled ?? true, visits);
