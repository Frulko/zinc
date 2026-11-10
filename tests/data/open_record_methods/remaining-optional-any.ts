// Remaining ZN-1030 gap: an optional dynamic slot conflates explicit null with absence.
class Empty {}
type Optional = { value?: any };
const view: Optional = new Empty();
view.value = null;
console.log(JSON.stringify(view));
