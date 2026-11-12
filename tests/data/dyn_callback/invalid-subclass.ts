const callback: unknown = (value: DynNum): DynNum => value;
const restored = callback as (value: DynNum) => DynNum;
restored(new DynStr('wrong'));
