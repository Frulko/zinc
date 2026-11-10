# Native KTX2 fixtures

These tiny images are generated test data, with no third-party image licence.
The PNGs are constant RGBA: opaque/large `(255,0,0,255)`, alpha `(255,0,0,128)`,
mid `(128,96,64,255)` and premul `(64,48,32,128)`. All are 8×8 except large (129×129).

Encode with Zinc's pinned Basis Universal 2.50 command:

```sh
basisu -ktx2 -etc1s -q 255 -mipmap -no_alpha -file opaque.png -output_file opaque.ktx2
basisu -ktx2 -etc1s -q 255 -mipmap -linear -file alpha.png -output_file alpha.ktx2
basisu -ktx2 -etc1s -q 255 -mipmap -mip_smallest 4 -no_alpha -file opaque.png -output_file incomplete.ktx2
basisu -ktx2 -etc1s -q 255 -mipmap -no_alpha -file mid.png -output_file mid-srgb.ktx2
basisu -ktx2 -etc1s -q 255 -mipmap -linear -no_alpha -file mid.png -output_file mid-linear.ktx2
basisu -ktx2 -etc1s -q 255 -mipmap -file premul.png -output_file premul.ktx2
basisu -ktx2 -etc1s -q 255 -no_alpha -file large.png -output_file large.ktx2
basisu -ktx2 -uastc -ktx2_no_zstandard -file opaque.png -output_file uastc.ktx2
```

After encoding premul, set bit 0 of the DFD flags byte (`dfdByteOffset + 15`) to
declare the already premultiplied input. The color tests compare stored RGB with
an opaque material to detect accidental double premultiplication; application
blending is a separate choice. UASTC is deliberately rejected by this ETC1S loader.

All four-mip fixtures contain 8×8, 4×4, 2×2 and 1×1 images. Incomplete stops at 4×4;
large has one mip and crosses the native ABI's 65,536-element typed-result threshold.
