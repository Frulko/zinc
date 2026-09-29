const mask: u32 = 4294967295;
const signed: i32 = -123;
const fractional: f64 = 7.9;
console.log('mixed', mask ^ signed, mask & signed, mask | signed, fractional ^ signed);
