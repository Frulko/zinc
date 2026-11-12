const numberValue = 42 as unknown as DynNum;
class NumberBox {
  visit(f: (value: DynNum) => DynNum): DynNum { return f(numberValue); }
}
const box: any = new NumberBox();
console.log(box.visit((value: DynNum): DynNum => value) === numberValue);
const callback: unknown = (value: DynNum): DynNum => value;
const restored = callback as (value: DynNum) => DynNum;
console.log(restored(numberValue) === numberValue);
