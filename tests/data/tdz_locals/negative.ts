function invalid(value: i32): i32 {
  { let value: string = 'inner'; }
  return value.missing;
}
console.log(invalid(1));
