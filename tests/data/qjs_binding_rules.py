#!/usr/bin/env python3
"""The QuickJS binding rules of docs/plugins.md ("Binding to QuickJS"), checked on the sources (ZN-601).

1. No exception as a type test: a buffer accessor that throws on the wrong type (JS_GetArrayBuffer, JS_GetUint8Array,
   napi_get_arraybuffer_info, napi_get_typedarray_info, napi_get_dataview_info) is called only after the non-throwing test
   of that type, on the same line or one of the five before.
2. No heap allocation per call on the hot paths: the bodies of the call thunks and of the hot WebGL entry points hold no
   std::vector, except on a line marked `// slow path` (a plain JS array, bytes returned as an array).
Prints each violation as file:line and exits 1 when there is one.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIRS = ["src/qjs", "src/gl"]
THROWING = re.compile(r"\b(JS_GetArrayBuffer|JS_GetUint8Array|napi_get_arraybuffer_info|napi_get_typedarray_info|napi_get_dataview_info)\s*\(")
TESTS = re.compile(r"\b(JS_IsArrayBuffer|JS_GetTypedArrayType|JS_GetTypedArrayData|napi_is_arraybuffer|napi_is_typedarray|napi_is_dataview)\s*\(")
# the hot paths: the thunks every call goes through and the WebGL entry points a frame calls most (ZN-596's list)
HOT_FUNCS = {"src/qjs/qjs.cpp": ["hostFn"], "src/gl/webgl_js.cpp": ["callThunk", "uniformFv", "uniformIv", "uniformMat", "attribF"]}
HOT_METHODS = re.compile(r"^M\((uniform\w*|bind\w*|enable\w*|disable\w*|vertexAttribPointer|drawArrays\w*|drawElements\w*|viewport)\)")


def sources():
    for d in DIRS:
        for dirpath, _, names in os.walk(os.path.join(ROOT, d)):
            for n in sorted(names):
                if n.endswith((".c", ".cc", ".cpp", ".h", ".hpp", ".mm")):
                    yield os.path.relpath(os.path.join(dirpath, n), ROOT)


def body(lines, start):
    """Lines of the function whose definition starts at `start`, through its closing brace."""
    depth, seen = 0, False
    for i in range(start, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        seen = seen or "{" in lines[i]
        if seen and depth <= 0:
            return range(start, i + 1)
    return range(start, len(lines))


def check(rel, text):
    bad = []
    lines = text.split("\n")
    code = [re.sub(r"//.*", "", l) for l in lines]
    for i, l in enumerate(code):
        if THROWING.search(l) and not any(TESTS.search(code[j]) for j in range(max(0, i - 5), i + 1)):
            bad.append(f"{rel}:{i + 1}: a throwing buffer accessor without a type test first (rule 1): {lines[i].strip()[:100]}")
    starts = []
    for name in HOT_FUNCS.get(rel, []):
        found = [i for i, l in enumerate(code) if re.match(r"^\S.*\b" + name + r"\s*\(.*\)\s*\{", l)]
        if not found:   # renamed or moved: the list above follows, or the check would pass on nothing
            bad.append(f"{rel}: the hot function {name} is not found (update HOT_FUNCS in {os.path.relpath(__file__, ROOT)})")
        starts += found
    if rel == "src/gl/webgl_js.cpp":
        starts += [i for i, l in enumerate(code) if HOT_METHODS.match(l)]
    for s in starts:
        for i in body(code, s):
            if "std::vector" in code[i] and "// slow path" not in lines[i]:
                bad.append(f"{rel}:{i + 1}: std::vector on a hot path (rule 2): {lines[i].strip()[:100]}")
    return bad


def main():
    files = sys.argv[1:] or list(sources())
    bad = []
    for rel in files:
        with open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace") as f:
            bad += check(rel, f.read())
    for b in bad:
        print(b)
    if bad:
        return 1
    hot = sum(len(v) for v in HOT_FUNCS.values())
    print(f"ok: {len(files)} files, {hot} thunks and the hot WebGL methods follow the binding rules")
    return 0


if __name__ == "__main__":
    sys.exit(main())
