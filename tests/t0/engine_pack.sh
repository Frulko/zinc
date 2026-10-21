#!/bin/sh
# Engine packs (ZN-773.04): tools/engine-pack makes a pack of this build's libzn_engine_jsc, tools/index-repo signs a file:// index with it, and a
# zinc without the module beside it downloads the pack on first use of --engine jsc, checks it and runs the program; zinc engine list, update and
# remove, the doctor line; zinc export of a project on that engine carries the pack and the JIT entitlement and runs on a machine without packs;
# a tampered pack and a pack of another engine ABI are refused, and no index says what to do. macOS only (otool, codesign; the system's JSC).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skip: engine packs are made on macOS for now"; exit 0; }
[ -f "$(dirname "$ZINC")/libzn_engine_jsc.dylib" ] || { echo "skip: no libzn_engine_jsc beside zinc"; exit 0; }
ZINC=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC") exec python3 - "$PWD" <<'PY'
import importlib.machinery, importlib.util, json, os, shutil, subprocess, sys, tarfile, tempfile
R = sys.argv[1]; Z = os.environ["ZINC"]; tmp = tempfile.mkdtemp(); fails = []
loader = importlib.machinery.SourceFileLoader("index_repo", os.path.join(R, "tools", "index-repo")); spec = importlib.util.spec_from_loader("index_repo", loader)
ir = importlib.util.module_from_spec(spec); loader.exec_module(ir)
def run(args, home, index=None, cwd=None):
    env = dict(os.environ, ZINC_HOME=home, ZINC_INDEX_URL=index or "file://" + repo, ZINC_INDEX_ROOT=os.path.join(repo, "root.json"), ZINC_NO_UPDATE_CHECK="1", ZINC_HEADLESS="1", ZINC_MIRRORS="", ZINC_STEPS="1")
    try: r = subprocess.run(args, capture_output=True, text=True, env=env, cwd=cwd, timeout=120)
    except OSError as e: return 127, str(e)
    return r.returncode, r.stdout + r.stderr
def expect(name, ok, out, *words):
    if os.environ.get("ENGINE_PACK_SHOW"): print("--- %s (rc %d)\n%s" % (name, out[0], out[1].strip()))   # what each step printed
    if ok != (out[0] == 0) or any(w not in out[1] for w in words): fails.append("%s: rc %d, %s" % (name, out[0], out[1].strip()[-600:]))
def fresh(name):   # a ZINC_HOME of its own, sharing the toolchains (the pinned esbuild) with this machine's
    h = os.path.join(tmp, "home-" + name); os.makedirs(h)
    real = os.path.join(os.environ.get("ZINC_HOME") or os.path.expanduser("~/.zinc"), "toolchains"); os.makedirs(real, exist_ok=True)
    os.symlink(real, os.path.join(h, "toolchains")); return h
def pack(version, abi=None):   # this build's JavaScriptCore module as pack <version>; abi: what the index claims it was built for
    d = os.path.join(tmp, "dist-" + version)
    subprocess.run([os.path.join(R, "tools", "engine-pack"), "jsc", "--build", os.path.dirname(Z), "--out", d, "--version", version, "--upstream", "system"], check=True, capture_output=True)
    e = json.load(open(os.path.join(d, "entries.json")))["targets"]
    return {p: (open(t["file"], "rb").read(), dict(t["custom"], **({"zn_engine_abi": abi} if abi else {}))) for p, t in e.items()}
keys = {r: [ir.keygen()] for r in ir.ROLES}
repo = os.path.join(tmp, "repo")
v1 = pack("1.0.0")
ir.build(repo, keys, v1)
bindir = os.path.join(tmp, "bin"); os.makedirs(bindir)   # zinc without its engine modules beside it
shutil.copy(Z, bindir)
for m in ("libzn_window.dylib", "libzn_webgl.dylib"):
    if os.path.exists(os.path.join(os.path.dirname(Z), m)): shutil.copy(os.path.join(os.path.dirname(Z), m), bindir)
zinc = os.path.join(bindir, os.path.basename(Z))
hello = os.path.join(tmp, "hello.js"); open(hello, "w").write("console.log('hello', __ZINC_ENGINE__);\n")
home = fresh("main")
expect("first use downloads, checks and runs", True, run([zinc, "run", hello, "--engine", "jsc"], home), "downloading", "checked: SHA-256", "installed in", "hello jsc")
expect("second run uses the installed pack", True, run([zinc, "run", hello, "--engine", "jsc"], home), "hello jsc")
if "downloading" in run([zinc, "run", hello, "--engine", "jsc"], home)[1]: fails.append("the second run downloaded the pack again")
expect("list", True, run([zinc, "engine", "list"], home), "jsc      1.0.0", "ABI 2")
expect("doctor", True, run([zinc, "doctor"], home), "JavaScript engines", "packs: jsc 1.0.0")
expect("update, nothing newer", True, run([zinc, "engine", "update"], home), "jsc 1.0.0 is up to date")
v2 = pack("1.0.1"); v2.update(v1)
ir.build(repo, keys, v2, version=2)
expect("update to 1.0.1", True, run([zinc, "engine", "update", "jsc"], home), "jsc 1.0.1: ")
out = run([zinc, "engine", "list"], home)
if "1.0.1" not in out[1] or "1.0.0" in out[1]: fails.append("after update: " + out[1])
# zinc export: the pack and the JIT entitlement inside the .app, which runs where no pack is installed and no index answers
proj = os.path.join(tmp, "hi"); os.makedirs(proj)
json.dump({"name": "hi", "entry": "main.js", "engine": "jsc", "app": {"id": "dev.zinc.test.hi"}}, open(os.path.join(proj, "zinc.json"), "w"))
open(os.path.join(proj, "main.js"), "w").write("console.log('exported', __ZINC_ENGINE__, process.argv.length >= 0);\n")
expect("export", True, run([zinc, "export", proj, "--target", "macos"], home))
app = os.path.join(proj, "dist", "hi-macos", "hi.app")
if not os.path.isfile(os.path.join(app, "Contents", "Resources", "engines", "jsc", "libzn_engine_jsc.dylib")): fails.append("the exported app has no pack: " + str(os.listdir(os.path.join(app, "Contents", "Resources"))))
ent = subprocess.run(["codesign", "-d", "--entitlements", "-", os.path.join(app, "Contents", "MacOS", "zinc")], capture_output=True, text=True)
if "com.apple.security.cs.allow-jit" not in ent.stdout + ent.stderr: fails.append("the exported zinc has no allow-jit: " + ent.stdout + ent.stderr)
v = subprocess.run(["codesign", "--verify", "--deep", "--strict", app], capture_output=True, text=True)
if v.returncode: fails.append("the exported app's signature does not verify: " + v.stderr)
expect("the exported app runs on its own pack", True, run([os.path.join(proj, "dist", "hi-macos", "run.sh")], fresh("bare"), "file:///nonexistent"), "exported jsc true")
expect("remove", True, run([zinc, "engine", "remove", "jsc"], home), "removed jsc 1.0.1")
expect("list after remove", True, run([zinc, "engine", "list"], home), "no engine pack installed")
# refused: a pack whose bytes differ from the signed ones, a pack made for another engine ABI; no index: what to do
ir.build(repo, keys, v1, version=3)
p = os.path.join(repo, "targets", next(iter(v1)))
b = bytearray(open(p, "rb").read()); b[len(b) // 2] ^= 0xff; open(p, "wb").write(bytes(b))
h = fresh("tampered")
expect("tampered pack", False, run([zinc, "engine", "install", "jsc"], h), "does not verify")
if os.path.exists(os.path.join(h, "engines", "jsc")): fails.append("a tampered pack left files in engines/jsc")
ir.build(repo, keys, pack("1.0.2", abi=999), version=4)
h = fresh("abi")
expect("wrong zn_engine_abi", False, run([zinc, "engine", "install", "jsc"], h), "ABI 999 only", "this zinc speaks ABI 2")
expect("wrong zn_engine_abi on first use", False, run([zinc, "run", hello, "--engine", "jsc"], h), "could not be downloaded", "ABI 999 only")
expect("no index", False, run([zinc, "run", hello, "--engine", "jsc"], fresh("offline"), "file:///nonexistent"), "could not be downloaded", "zinc engine install jsc", "ZINC_ENGINE_JSC")
# Hermes (ZN-773.08): the pack of this build's module, with libhermesvm and the licences of what is compiled into it, downloaded on first use
if os.path.exists(os.path.join(os.path.dirname(Z), "libzn_engine_hermes.dylib")):
    d = os.path.join(tmp, "dist-hermes")
    subprocess.run([os.path.join(R, "tools", "engine-pack"), "hermes", "--build", os.path.dirname(Z), "--out", d], check=True, capture_output=True)
    e = json.load(open(os.path.join(d, "entries.json")))["targets"]
    with tarfile.open(next(iter(e.values()))["file"]) as t: names = set(t.getnames())
    want = {"libzn_engine_hermes.dylib", "lib/libhermesvm.dylib", "licenses/LICENSE", "licenses/LICENSE.llvh.txt", "licenses/LICENSE.dtoa.txt", "licenses/LICENSE.boost.txt"}
    if not want <= names: fails.append("the hermes pack lacks %s" % sorted(want - names))
    ir.build(repo, keys, {p: (open(t["file"], "rb").read(), t["custom"]) for p, t in e.items()}, version=5)
    expect("hermes: first use downloads, checks and runs", True, run([zinc, "run", hello, "--engine", "hermes"], fresh("hermes")), "downloading", "checked: SHA-256", "hello hermes")
shutil.rmtree(tmp, ignore_errors=True)
for f in fails: print("engine_pack:", f)
sys.exit(1 if fails else 0)
PY
