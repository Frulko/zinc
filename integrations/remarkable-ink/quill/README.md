# Quill's engine shim, patched for OS 3.28+

`libquill.so` is the L2 engine of `display-rmpp` (`native.h`): `zinc export --target rmpp` with `"ink": "session"` ships it beside the app.

- Source: [MaximeRivest/quill](https://github.com/MaximeRivest/quill) commit `39262ee0bef69915e3ead3ac218d5973916f422a` (the v0.1.0 release), MIT (`LICENSE`).
- Patch: `0001-swapbuffers-os-3.28.patch`. OS 3.28 dropped the `EPContentType` parameter of `EPFramebuffer::swapBuffers`;
  the shim resolves the 3.27 signature first, then the new one, so one file serves both. Upstream has had no commit since 2026-07-12.
- Built with reMarkable's SDK codex 5.7.119 (Qt 6.8.2), against the OS 3.29.0.153 `libqsgepaper.so` pulled from the tablet:

  ```sh
  source /sdk/environment-setup-cortexa53-crypto-remarkable-linux; QTINC="$SDKTARGETSYSROOT/usr/include"
  $CXX -fPIC -shared -O2 -std=c++17 -I "$QTINC" -I "$QTINC/QtCore" -I "$QTINC/QtGui" src/vendor_probe.cpp src/quill_c.cpp \
    -L vendor -lqsgepaper -lQt6Gui -lQt6Core -ldl -o build/libquill.so
  ```

- SHA-256 `0a9d7ef217a5f6402801e8f42d6b837bdbfb202e3dddd3655438a40944620c45`. Proven on a Paper Pro on OS 3.29.0.153 (2026-10-25,
  Quill's `scribble` under the lease); OS 3.27 was proven with the unpatched v0.1.0 only.
