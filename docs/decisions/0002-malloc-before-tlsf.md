# 0002 — TLSF heap over hal_heap_region

**Choice.** `zrt::alloc` uses a two-level segregated-fit allocator (O(1)) over the region returned by
`hal_heap_region`; its size comes from the profile (`ZRT_HEAP_BYTES`: 512 MiB hosts, 64 MiB rpi1, 16 MiB ps2,
256 KiB ps1, 160 KiB esp32), so `--profile ps1` on a Mac runs out of memory where a PS1 would.
Debug builds use the system allocator so that ASan sees every block.
