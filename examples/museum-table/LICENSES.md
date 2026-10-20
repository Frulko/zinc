# Sources and licences of the sample collection

Every file under `assets/` is listed here with where it comes from. All of them are in the public domain or under CC0 1.0
(<https://creativecommons.org/publicdomain/zero/1.0/>), checked on each work's own record on 2026-10-10: the museums' open-access programmes
release these images and this 3D model without restriction. The same credits are in `assets/project.json` (`media[].credit`), which is what the
table shows to visitors. `tools/fetch-collection.sh` downloads the originals again and rebuilds every file.

The texts of `project.json` (titles in French, descriptions, audio descriptions, narration) were written for this example from the museums'
records and are released under CC0 1.0 as well. The code of the example follows the licence of the repository.

## Photographs

Resized to 1280 pixels on the long side and saved as JPEG (quality 70) with `sips`; nothing else was changed.

| file | work | institution, accession number, credit line | source | licence |
| --- | --- | --- | --- | --- |
| `photos/great-wave.jpg` | Katsushika Hokusai, *Under the Wave off Kanagawa (The Great Wave)*, ca. 1830–32 | The Metropolitan Museum of Art, New York, JP1847. H. O. Havemeyer Collection, Bequest of Mrs. H. O. Havemeyer, 1929 | <https://www.metmuseum.org/art/collection/search/45434> | CC0 1.0 (The Met Open Access) |
| `photos/red-fuji.jpg` | Katsushika Hokusai, *South Wind, Clear Sky (Red Fuji)*, ca. 1830–32 | The Metropolitan Museum of Art, JP9. Rogers Fund, 1914 | <https://www.metmuseum.org/art/collection/search/36490> | CC0 1.0 (The Met Open Access) |
| `photos/ejiri.jpg` | Katsushika Hokusai, *Ejiri in Suruga Province*, ca. 1830–32 | The Metropolitan Museum of Art, JP12. Rogers Fund, 1914 | <https://www.metmuseum.org/art/collection/search/36493> | CC0 1.0 (The Met Open Access) |
| `photos/sudden-shower.jpg` | Utagawa Hiroshige, *Sudden Shower over Shin-Ōhashi Bridge and Atake*, 1857 | The Metropolitan Museum of Art, JP643. Purchase, Joseph Pulitzer Bequest, 1918 | <https://www.metmuseum.org/art/collection/search/36461> | CC0 1.0 (The Met Open Access) |
| `photos/kanbara-snow.jpg` | Utagawa Hiroshige, *Evening Snow at Kanbara*, ca. 1833–34 | The Metropolitan Museum of Art, JP2492. The Howard Mansfield Collection, Purchase, Rogers Fund, 1936 | <https://www.metmuseum.org/art/collection/search/56915> | CC0 1.0 (The Met Open Access) |
| `photos/three-beauties.jpg` | Kitagawa Utamaro, *Three Beauties of the Kwansei Period*, ca. 1791 | The Metropolitan Museum of Art, JP1528. Fletcher Fund, 1929 | <https://www.metmuseum.org/art/collection/search/55639> | CC0 1.0 (The Met Open Access) |
| `photos/irises.jpg` | Vincent van Gogh, *Irises*, 1890 | The Metropolitan Museum of Art, 58.187. Gift of Adele R. Levy, 1958 | <https://www.metmuseum.org/art/collection/search/436528> | CC0 1.0 (The Met Open Access) |
| `photos/divan-japonais.jpg` | Henri de Toulouse-Lautrec, *Divan Japonais*, 1892–93 | The Metropolitan Museum of Art, 58.621.17. Bequest of Clifford A. Furst, 1958 | <https://www.metmuseum.org/art/collection/search/334197> | CC0 1.0 (The Met Open Access) |
| `photos/nocturne.jpg` | James McNeill Whistler, *Nocturne (Nocturne: The Thames at Battersea)*, 1878 | The Metropolitan Museum of Art, 17.3.159. Harris Brisbane Dick Fund, 1917 | <https://www.metmuseum.org/art/collection/search/337702> | CC0 1.0 (The Met Open Access) |
| `photos/plum-garden.jpg` | Utagawa Hiroshige, *Plum Garden at Kameido*, 1857 | The Art Institute of Chicago, 1925.3752. Clarence Buckingham Collection | <https://www.artic.edu/artworks/26577> | CC0 1.0 (Art Institute of Chicago, public domain) |
| `photos/water-lily-pond.jpg` | Claude Monet, *Water Lily Pond*, 1900 | The Art Institute of Chicago, 1933.441. Mr. and Mrs. Lewis Larned Coburn Memorial Collection | <https://www.artic.edu/artworks/87088> | CC0 1.0 (Art Institute of Chicago, public domain) |
| `photos/the-letter.jpg` | Mary Cassatt, *The Letter*, 1890–91 | The Art Institute of Chicago, 1932.1282. Mr. and Mrs. Martin A. Ryerson Collection | <https://www.artic.edu/artworks/13508> | CC0 1.0 (Art Institute of Chicago, public domain) |

How each licence was read: The Met's collection API gives `isPublicDomain: true` for these nine objects (objects where it is false, among them the
Monet and Cassatt works first chosen, were left out); the Art Institute of Chicago's API gives `is_public_domain: true` for these three and states
that its data, descriptions aside, is under CC0 (the descriptions were not copied).

## 3D model

| file | work | institution, accession number, credit line | source | licence |
| --- | --- | --- | --- | --- |
| `models/vase.obj`, `models/vase.jpg` | *Baluster vase, from a five-piece garniture*, Jingdezhen, Qing dynasty, Kangxi reign (1662–1722) | National Museum of Asian Art, Smithsonian Institution, F1980.191a-c. Gift of Myron S. Falk, Jr. and his sisters, Mrs. Mildred F. Loew and Mrs. Eleanor F. Lenzner | <https://asia.si.edu/object/F1980.191a-c/>; model package `3d_package:d8c6393a-4ebc-11ea-b77f-2e728ce88125`, file `f1980_191-150k-obj.zip` on <https://3d-api.si.edu> | CC0 1.0 (Smithsonian Open Access) |

The Smithsonian's record gives "Restrictions & Rights: CC0" for the object and for its 3D model. The 149 999-triangle OBJ was decimated to 12 000
triangles (7 058 vertices) with `tools/decimate.cpp`, which uses meshoptimizer 1.3 (vendored in `third_party`), keeping texture
coordinates and normals; its 4096-pixel texture was resized to 1536 pixels with `sips`.

## Panorama

| file | work | source | licence |
| --- | --- | --- | --- |
| `panoramas/ninomaru.jpg` | Greg Zaal, *Ninomaru Teien*, a 360-degree photograph taken in 2018 in the Ninomaru garden of Nagoya Castle | Poly Haven, <https://polyhaven.com/a/ninomaru_teien> (the tone-mapped JPEG) | CC0 1.0 |

Resized to 2048 by 1024 pixels with `sips`.

## Made for this example

| file | what it is | licence |
| --- | --- | --- |
| `video/great-wave.mp4` | Ten seconds across The Met's photograph of the Great Wave (JP1847, above), made with ffmpeg | CC0 1.0 |
| `video/great-wave.fr.vtt`, `video/great-wave.en.vtt` | Its subtitles | CC0 1.0 |
| `video/great-wave.jpg` | Its poster: its first picture | CC0 1.0 |
| `project.json` | The project file | CC0 1.0 |

## Narration

The narration is a synthesised voice: `tools/narration.sh` reads the transcripts of `project.json` (written for this example, CC0 1.0) with
[Piper](https://github.com/rhasspy/piper) 2023.11.14-2 (MIT; the program and the voice models are downloaded outside the repository and are not
redistributed) and writes one MP3 per language (mono, 22.05 kHz, about 4 kB per second) and its subtitles. The voices come from
<https://huggingface.co/rhasspy/piper-voices> (the repository is under the MIT licence); each voice's own model card was read on 2026-10-10.

| file | what it is | voice | data the voice was trained on, licence |
| --- | --- | --- | --- |
| `audio/welcome.fr.mp3`, `audio/japonisme-voice.fr.mp3`, `audio/porcelain-voice.fr.mp3`, `audio/garden-voice.fr.mp3` | The narration in French | `fr_FR-mls-medium`, speaker 1840 ([model card](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/mls/medium/MODEL_CARD): "Trained from scratch"; SHA-256 of the model `0ed223f78466917f2bae05ee90096ce69ab1fdeb251f55590d0e7422d234e162`) | The French part of Multilingual LibriSpeech, <http://openslr.org/94/> (V. Pratap, Q. Xu, A. Sriram, G. Synnaeve, R. Collobert, *MLS: A Large-Scale Multilingual Dataset for Speech Research*, Interspeech 2020), CC BY 4.0, made from LibriVox recordings in the public domain |
| `audio/welcome.en.mp3`, `audio/japonisme-voice.en.mp3`, `audio/porcelain-voice.en.mp3`, `audio/garden-voice.en.mp3` | The narration in English | `en_GB-cori-medium` ([model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_GB/cori/medium/MODEL_CARD): "Trained from scratch", by Bryce Beattie; SHA-256 of the model `1899f98e5fb8310154f3c2973f4b8a929ba7245e722b3d3a85680b833d95f10d`) | About 24 hours of LibriVox recordings, public domain |
| `audio/welcome.fr.vtt`, `audio/welcome.en.vtt`, `audio/japonisme-voice.fr.vtt`, `audio/japonisme-voice.en.vtt`, `audio/porcelain-voice.fr.vtt`, `audio/porcelain-voice.en.vtt`, `audio/garden-voice.fr.vtt`, `audio/garden-voice.en.vtt` | Their subtitles, one cue per sentence, timed on the voice | | CC0 1.0 |

The clips are distributed under CC BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>), the strictest of the two sources, with the attribution
above; the same credit is in `project.json` and on the table.

## Audio descriptions

What the table says of a picture, the object or the panorama on request (ZN-650.10): the `audioDescription` texts of `project.json` (written
for this example, CC0 1.0), read by the same two voices with the same tool, `tools/narration.sh --only descriptions`, on 2026-10-11. The
clips are under CC BY 4.0 with the attribution of the voices above, as the narration is; their place is `accessibility.descriptions` of the
project file.

| file | what it is | voice |
| --- | --- | --- |
| `audio/descriptions/great-wave.fr.mp3`, `audio/descriptions/red-fuji.fr.mp3`, `audio/descriptions/ejiri.fr.mp3`, `audio/descriptions/sudden-shower.fr.mp3`, `audio/descriptions/plum-garden.fr.mp3`, `audio/descriptions/kanbara-snow.fr.mp3`, `audio/descriptions/three-beauties.fr.mp3`, `audio/descriptions/irises.fr.mp3`, `audio/descriptions/water-lily-pond.fr.mp3`, `audio/descriptions/the-letter.fr.mp3`, `audio/descriptions/divan-japonais.fr.mp3`, `audio/descriptions/nocturne.fr.mp3`, `audio/descriptions/vase.fr.mp3`, `audio/descriptions/garden.fr.mp3` | The audio descriptions in French: twelve photographs, the vase, the panorama | `fr_FR-mls-medium`, speaker 1840 |
| `audio/descriptions/great-wave.en.mp3`, `audio/descriptions/red-fuji.en.mp3`, `audio/descriptions/ejiri.en.mp3`, `audio/descriptions/sudden-shower.en.mp3`, `audio/descriptions/plum-garden.en.mp3`, `audio/descriptions/kanbara-snow.en.mp3`, `audio/descriptions/three-beauties.en.mp3`, `audio/descriptions/irises.en.mp3`, `audio/descriptions/water-lily-pond.en.mp3`, `audio/descriptions/the-letter.en.mp3`, `audio/descriptions/divan-japonais.en.mp3`, `audio/descriptions/nocturne.en.mp3`, `audio/descriptions/vase.en.mp3`, `audio/descriptions/garden.en.mp3` | The audio descriptions in English | `en_GB-cori-medium` |
| `audio/descriptions/great-wave.fr.vtt`, `audio/descriptions/red-fuji.fr.vtt`, `audio/descriptions/ejiri.fr.vtt`, `audio/descriptions/sudden-shower.fr.vtt`, `audio/descriptions/plum-garden.fr.vtt`, `audio/descriptions/kanbara-snow.fr.vtt`, `audio/descriptions/three-beauties.fr.vtt`, `audio/descriptions/irises.fr.vtt`, `audio/descriptions/water-lily-pond.fr.vtt`, `audio/descriptions/the-letter.fr.vtt`, `audio/descriptions/divan-japonais.fr.vtt`, `audio/descriptions/nocturne.fr.vtt`, `audio/descriptions/vase.fr.vtt`, `audio/descriptions/garden.fr.vtt`, `audio/descriptions/great-wave.en.vtt`, `audio/descriptions/red-fuji.en.vtt`, `audio/descriptions/ejiri.en.vtt`, `audio/descriptions/sudden-shower.en.vtt`, `audio/descriptions/plum-garden.en.vtt`, `audio/descriptions/kanbara-snow.en.vtt`, `audio/descriptions/three-beauties.en.vtt`, `audio/descriptions/irises.en.vtt`, `audio/descriptions/water-lily-pond.en.vtt`, `audio/descriptions/the-letter.en.vtt`, `audio/descriptions/divan-japonais.en.vtt`, `audio/descriptions/nocturne.en.vtt`, `audio/descriptions/vase.en.vtt`, `audio/descriptions/garden.en.vtt` | Their subtitles, one cue per sentence, timed on the voice (CC0 1.0) | |

Voices that were left aside, because the licence of what they were made from does not clearly allow distributing what they say: every voice
"finetuned from" `en_US-lessac` (`fr_FR-siwis-medium`, `fr_FR-upmc-medium`, `en_GB-alba-medium` and most English voices), since the Lessac data
of the Blizzard Challenge 2013 is licensed to a named licensee on request; the voices tuned from `en_US-ryan` (`fr_FR-siwis-low`,
`fr_FR-gilles-low`, `fr_FR-mls_1840-low`), whose data is CC BY-NC-SA 4.0; `fr_FR-tom-medium` (AGPL-3.0). Nothing made with the Mac's `say`
command is in the repository: as we read Apple's software licence, the system voices are for personal, non-commercial use. A museum replaces
the clips with a recorded voice under the same file names, or sets another voice in `tools/narration.sh`.
