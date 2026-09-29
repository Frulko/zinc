function deepest(): void {
  throw new Error('source trace');
}
function middle(): void {
  deepest();
}
middle();
