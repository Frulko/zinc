// What modern code calls and mquickjs (ES5 with a few extensions) lacks, added where missing; zinc puts it before every program it builds
// for the firmware (--engine mquickjs). ES5 itself: it is not lowered. Map, Set, Promise, Symbol and generators' iterators are not here:
// a program that needs them fails in the check zinc runs on the computer, with the name.
(function () {
  function add(o, name, f) { if (!o[name]) o[name] = f; }
  // what SWC's helpers call: Object.create with descriptors (classes' extends), the property lists of object spread and rest
  var create = Object.create;
  Object.create = function (proto, props) { var o = create(proto); if (props) for (var k of Object.keys(props)) Object.defineProperty(o, k, props[k]); return o; };
  add(Object, "getOwnPropertyNames", Object.keys);
  add(Object.prototype, "propertyIsEnumerable", Object.prototype.hasOwnProperty);
  var A = Array.prototype, S = String.prototype;
  add(A, "find", function (f, t) { for (var i = 0; i < this.length; i++) if (f.call(t, this[i], i, this)) return this[i]; });
  add(A, "findIndex", function (f, t) { for (var i = 0; i < this.length; i++) if (f.call(t, this[i], i, this)) return i; return -1; });
  add(A, "includes", function (v) { for (var i = 0; i < this.length; i++) if (this[i] === v || (v !== v && this[i] !== this[i])) return true; return false; });
  add(A, "fill", function (v, s, e) { var n = this.length; s = s || 0; e = e === undefined ? n : e; for (var i = s < 0 ? n + s : s; i < (e < 0 ? n + e : e); i++) this[i] = v; return this; });
  add(Array, "from", function (src, f) { var r = []; for (var i = 0; i < src.length; i++) r.push(f ? f(src[i], i) : src[i]); return r; });
  add(Array, "of", function () { return A.slice.call(arguments); });
  add(S, "startsWith", function (s, p) { return this.indexOf(s, p || 0) === (p || 0); });
  add(S, "endsWith", function (s) { var i = this.length - s.length; return i >= 0 && this.indexOf(s, i) === i; });
  add(S, "includes", function (s, p) { return this.indexOf(s, p || 0) >= 0; });
  add(S, "padStart", function (n, f) { var s = String(this); f = f === undefined ? " " : String(f); while (s.length < n) s = f + s; return s.slice(s.length - Math.max(n, this.length)); });
  add(S, "padEnd", function (n, f) { var s = String(this); f = f === undefined ? " " : String(f); while (s.length < n) s += f; return s.slice(0, Math.max(n, this.length)); });
  add(Object, "assign", function (t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s != null) for (var k of Object.keys(s)) t[k] = s[k]; } return t; });
  add(Object, "entries", function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); });
  add(Object, "values", function (o) { return Object.keys(o).map(function (k) { return o[k]; }); });
  add(Object, "freeze", function (o) { return o; });
  add(Number, "isInteger", function (v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v; });
  add(Number, "isFinite", function (v) { return typeof v === "number" && isFinite(v); });
  add(Math, "hypot", function () { var s = 0; for (var i = 0; i < arguments.length; i++) s += arguments[i] * arguments[i]; return Math.sqrt(s); });
})();
