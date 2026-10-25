# Photos

The photo library from Zinc ([zinc:photos](../../docs/plugins/photos.md)) in one small app: the access the person gave, with a button
to ask for it (or to choose more pictures when the access is limited), the albums with their counts, a grid of the chosen album's
thumbnails, a tap to see a picture whole, and a button that saves a generated picture into the album "Zinc".

```sh
ZINC_FAKE_PHOTOS=~/Pictures/some-folder build/zinc run examples/photos    # a folder of PNG and JPEG files stands in for the library
build/zinc export examples/photos --target ios --ipa --simulator          # an iPhone or the simulator: the real library
```

`zinc.json` asks for `"photos"`: the iOS export writes `NSPhotoLibraryUsageDescription` and `NSPhotoLibraryAddUsageDescription` with the
text of `"permissionStrings"`. In the fake library each subfolder is an album, and `ZINC_FAKE_PHOTOS_ACCESS=undetermined` (or `limited`,
`denied`) shows the other access screens. Zinc Go links zinc:photos too: `zinc dev examples/photos --lan` runs it there.

`src/`: `main.tsx` (the screens), `state.ts` (access, albums, thumbnails, the picture shown, the save), `picture.ts` (the generated picture).
