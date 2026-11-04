// Fixture-only RNG: pin jack placement and bot decisions for the scene golden.
let seed = 42;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
