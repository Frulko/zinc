The audio decoder uses baseline Opus 1.6.1. WebRTC uses the same release with DRED and deep PLC. Unprefixed archives link but silently disable WebRTC DRED when the baseline encoder resolves its calls first (the combined native regression reproduced this). `../opus_namespace.h` prefixes all 425 baseline global symbols, including CELT/SILK internals, only in audio's compilation. Upstream source files are unmodified.

For an upgrade, first compile the generic C baseline archive with the manifest's source order and defines, temporarily without its `-include ./opus_namespace.h` flag. Generate the header from that archive (macOS `nm`; use `nm -g --defined-only` on ELF and omit the Mach-O underscore removal):

```python
import json, pathlib, re, subprocess
manifest = json.loads(pathlib.Path('plugins/audio/plugin.json').read_text())
sources = manifest['targets']['macos']['sources']
first = next(i for i, source in enumerate(sources) if source.startswith('../webrtc/vendor/opus/'))
index, names = -1, set()
for line in subprocess.check_output(['nm', '-gU', 'BASELINE/vendor.a'], text=True).splitlines():
    member = re.search(r'v(\d+)\.o:', line)
    if member:
        index = int(member[1])
    fields = line.split()
    if index >= first and len(fields) == 3:
        names.add(fields[-1][1:])
header = '// Opus baseline globals; see vendor/OPUS-NAMESPACE.md.\n#pragma once\n'
header += ''.join(f'#define {name} zn_audio_{name}\n' for name in sorted(names))
pathlib.Path('plugins/audio/opus_namespace.h').write_text(header)
```

Restore the manifest flag and rebuild. The plugin build hashes root-level `.h` files into its vendor key, so a namespace header change invalidates the archive. Installed optional audio sources carry this header. `audio_opus` examines every Opus archive member and refuses any global without the prefix; upgrading the pin must also review its expected symbol count.

The combined regression uses **existing** WebRTC own and vendor archives, never compiles that plugin:

```
AUDIO_OPUS_WEBRTC_ARCHIVE=/path/to/webrtc/plugin.a \
AUDIO_OPUS_WEBRTC_VENDOR=/path/to/webrtc-vendor/vendor.a \
ZINC=/path/to/build/zinc tests/run --only audio_opus
```

Its factory creates/closes a peer without connecting it. Its codec round trip also enables 100 ms of DRED, then the same process runs the production audio decode/mixer checks. On macOS the supplied archives must match the generated header in their sibling `gen/` directory and the deployment target of this fixture (15.7.4). Network and Pi performance remain separate proposed checks.
