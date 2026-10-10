# Licences of what the pinball ships

The table "Tidal Lock" (`assets/tables/tidal-lock/`) is an original work: its name, layout, rules, art and sounds were
made for this example. Nothing comes from another pinball game. The same credits are in the table file itself
(`table.json`, `credits`), so they travel with the table when it is shared.

## Recorded sounds (CC0)

The mechanical sounds are cut out of six recordings published on [freesound.org](https://freesound.org) under
**Creative Commons Zero 1.0** (public domain dedication, <https://creativecommons.org/publicdomain/zero/1.0/>). The
licence of each was read on the page of the sound on 2026-10-10. CC0 asks for no credit; the authors are named anyway.
`tools/tidal_lock_sounds.py` downloads them (the preview files of the same pages), cuts the stretches named below and
writes the MP3 files.

| files of `sounds/` | recording | author | page | licence |
| --- | --- | --- | --- | --- |
| `flipper-up.mp3`, `flipper-down.mp3` | "pinball-flipper hits.wav", a 1977 Gottlieb machine: one hit, the coil then the return (8.26 s to 8.88 s) | schafferdavid | <https://freesound.org/people/schafferdavid/sounds/450270/> | CC0 1.0 |
| `bumper.mp3`, `slingshot.mp3`, `ball-knock.mp3`, `steel.mp3` | "pinball-bumper hits.wav", the same machine: two bumper hits (3.48 s, 1.14 s) and two ricochets of the ball (2.19 s, 4.24 s) | schafferdavid | <https://freesound.org/people/schafferdavid/sounds/450265/> | CC0 1.0 |
| `plunger-pull.mp3`, `plunger-shot.mp3` | "pinball-ball being launched by plunger.wav", the same machine: the pull (0.39 s) and the shot (1.34 s) | schafferdavid | <https://freesound.org/people/schafferdavid/sounds/450267/> | CC0 1.0 |
| `drain.mp3` | "pinball-ball falling under flippers.wav", the same machine (0.18 s to 1.14 s) | schafferdavid | <https://freesound.org/people/schafferdavid/sounds/450266/> | CC0 1.0 |
| `ball-roll.mp3`, `ball-land.mp3` | "Ball on table.wav", a marble on a table: a steady roll made into a loop (12.1 s to 14.45 s) and one drop (81.56 s) | NeatoEnt | <https://freesound.org/people/NeatoEnt/sounds/458137/> | CC0 1.0 |
| `dock-capture.mp3` | "Ball in hole.wav", the marble falling in a hole (10.27 s), mixed with a synthesised part | NeatoEnt | <https://freesound.org/people/NeatoEnt/sounds/458136/> | CC0 1.0 |

## Synthesised sounds and music

Every other file of `sounds/` (the effects of the targets, lanes, ramp, rail, gate, spinner and dock, the jingles of the
rules, and the four pieces of music) is computed sample by sample by `tools/tidal_lock_sounds.py`: oscillators, noise,
filters and envelopes written in the script, and music composed in it. No sample and no melody is taken from anywhere.
They are part of this repository and under its terms.

## Images and models

Every file of `art/` is drawn or built by `tools/tidal_lock_art.py`: the painting of the playfield and its lit twin, the
upper playfield, the ramp, the bumper caps, the flippers, the ball, the gas giant, the apron, the backboard, the plates
of the slingshots, the two backglass pictures, the palette, and the modelled pieces (`station.obj`, `tug.obj`, the two
`plastic-*.obj`). Nothing is fetched, traced or copied: shapes, colours and legends are in the script. They are part of
this repository and under its terms. The legends are set in Inter (`lib/fonts`, SIL Open Font License 1.1), whose
licence allows it in pictures without condition.

## Tools

The files are encoded as MP3 by ffmpeg with LAME (the MP3 patents have expired); the game decodes them with miniaudio
(`plugins/audio`, public domain or MIT-0).
