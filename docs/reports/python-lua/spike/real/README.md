# Real CPython and real Lua inside a Zinc program

The proof behind [../../00-study.md](../../00-study.md). Paths of Homebrew's Python 3.12 and Lua 5.5 on the development Mac are written in each `plugin.json`. Throwaway code: delete it when the product lands.

```sh
# py/: one time, the pip modules beside the app
uv pip install --python /opt/homebrew/bin/python3.12 --target py/site numpy humanize
# lua/: one time, the stand-in for a C rock
clang -O2 -bundle -undefined dynamic_lookup -I/opt/homebrew/include/lua lua/native-module/nativecount.c -o lua/rocks/lib/nativecount.so

cd py   # or lua
AUTO=1 ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_SHOT=/tmp/ui.png zinc run .        # reactive UI
DEMO=particles ZINC_HEADLESS=1 ZINC_FRAMES=70 ZINC_SHOT=/tmp/p.png zinc run .  # the frame loop
mkdir -p build && zinc build . -o build/app && ZINC_HEADLESS=1 ZINC_FRAMES=1 build/app   # AOT
```

`src/main.ts` is what the product would generate; `app/zinc.py` and `app/zinc.lua` likewise.
