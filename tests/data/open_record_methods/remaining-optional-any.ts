// An optional dynamic slot preserves explicit null as distinct from absence.
class Empty {}
type Optional = { value?: any };
const view: Optional = new Empty();
view.value = null;
console.log(JSON.stringify(view));
