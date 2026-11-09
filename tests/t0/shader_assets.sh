#!/bin/sh
# Shaders at build (ZN-444, src/assets/shader.h): `zinc assets build` checks each .vert / .frag of the assets directory with glslang in
# the variants of D29 (GLSL ES 1.00 with ZN_ES2; 3.00 with ZN_ES3 and the renamed keywords) and fails on an invalid one with the file and
# the line; a release build stores the shader without its comments and spaces. Needs libzn_webgl beside zinc (the module holds glslang).
cd "$(dirname "$0")/../.." || exit 2
[ -f "$(dirname "$ZINC")/libzn_webgl.dylib" ] || [ -f "$(dirname "$ZINC")/libzn_webgl.so" ] || { echo "skipped: no libzn_webgl beside zinc"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
p="$tmp/p"; mkdir -p "$p/assets/fx" "$p/src"
printf '{ "name": "p", "entry": "src/main.ts", "assets": { "dir": "assets" } }\n' > "$p/zinc.json"
printf 'console.log(1);\n' > "$p/src/main.ts"
cat > "$p/assets/fx/wave.vert" <<'EOF'
// a vertex shader in the GLSL ES 1.00 dialect (D29: one source for every profile)
attribute vec2 a_pos;   /* the corner */
varying vec2 v_uv;
uniform float u_t;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos.x, a_pos.y + sin(u_t + a_pos.x) * 0.1, 0.0, 1.0);
}
EOF
cat > "$p/assets/fx/wave.frag" <<'EOF'
varying vec2 v_uv;
uniform sampler2D u_tex;
#ifdef ZN_ES3
#define TINT vec3(1.0)
#else
#define TINT vec3(1.0, 1.0, 1.0)
#endif
void main() {
  // the texel, tinted
  gl_FragColor = vec4(texture2D(u_tex, v_uv).rgb * TINT, 1.0 - -0.0);
}
EOF
out=$("$ZINC" assets build "$p" 2>&1) || { echo "valid shaders refused: $out"; exit 1; }
printf 'varying vec2 v_uv;\nvoid main() {\n  vec3 c = vec3(v_uv, 0.0);\n  gl_FragColor = vec4(c, undefinedThing);\n}\n' > "$p/assets/fx/bad.frag"
out=$("$ZINC" assets build "$p" 2>&1) && { echo "an invalid shader did not fail the build: $out"; exit 1; }
echo "$out" | grep -q "fx/bad.frag: line 4: .*undefinedThing.*undeclared identifier (GLSL ES 1.00)" || { echo "the error does not name the file and line: $out"; exit 1; }
# GLSL ES 3.00 only: a shader that compiles as 1.00 but not once D29's prelude makes it 3.00 (a 3.00 keyword as a name)
printf 'varying vec2 v_uv;\nvoid main() {\n  float uint = v_uv.x;\n  gl_FragColor = vec4(uint);\n}\n' > "$p/assets/fx/bad.frag"
out=$("$ZINC" assets build "$p" 2>&1) && { echo "a shader invalid as GLSL ES 3.00 did not fail the build: $out"; exit 1; }
echo "$out" | grep -q "fx/bad.frag: line 3: .*(GLSL ES 3.00)" || { echo "the 3.00 error does not name the file and line: $out"; exit 1; }
rm "$p/assets/fx/bad.frag"
"$ZINC" assets build --release "$p" >/dev/null 2>&1 || { echo "the release build failed"; exit 1; }
dev=$(sed -n 's/.*"name": "fx\/wave.frag", [^}]*"outputBytes": \([0-9]*\).*/\1/p' "$p"/build/assets/*/report.json | head -1)
src=$(wc -c < "$p/assets/fx/wave.frag" | tr -d ' ')
[ -n "$dev" ] && [ "$dev" -lt "$src" ] || { echo "the release build did not strip wave.frag ($dev of $src bytes)"; exit 1; }
echo "shader_assets: ok (wave.frag $src -> $dev bytes in release)"
