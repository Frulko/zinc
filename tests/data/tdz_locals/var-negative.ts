function hoisted(): i32 {
  if (true) { var held: i32 = 12; }
  return held;
}
