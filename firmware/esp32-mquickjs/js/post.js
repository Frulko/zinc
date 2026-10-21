// SWC's helpers that mquickjs cannot run as SWC writes them, written again for it: zinc appends each one after a program whose ES5 defines a
// function of that name (the later declaration is the one that holds).
function _construct(Parent, args, Class) {   // new with a spread, and the subclasses of Error: no Reflect.construct
    var o = Object.create((Class || Parent).prototype), r = Parent.apply(o, args);
    if (r === null || (typeof r !== "object" && typeof r !== "function")) return o;
    if (Class) Object.setPrototypeOf(r, Class.prototype);
    return r;
}
function _object_spread_props(target, source) {   // { ...a, b }: no Object.getOwnPropertyDescriptors, no boxing by Object(source)
    if (source != null) for (var k of Object.keys(source)) target[k] = source[k];
    return target;
}
