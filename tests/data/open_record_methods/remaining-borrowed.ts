// Remaining ZN-1030 gap: an extracted method can use a structurally unrelated receiver in JavaScript.
class G { name = 'original'; greet(): string { return this.name; } }
const g: any = new G();
const other: any = { name: 'borrowed', greet: g.greet };
try { console.log(other.greet()); } catch (e) { console.log(e instanceof TypeError); }
