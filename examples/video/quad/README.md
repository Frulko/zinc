# quad

Four videos at once in a 2x2 grid: four `Player`s, four decoder threads, each decoded at tile size and looping on
its own. With more than four files, tile i plays files i, i+4, ... as its playlist.

```sh
zinc run examples/video/quad                                    # media/*.mp4
zinc run examples/video/quad -- a.mp4 b.mp4 c.mp4 d.mp4
zinc run examples/video/quad -- /path/to/folder
zinc build examples/video/quad --target rpi1
```

Keys: Space pause all, Right next file on every tile, Tab info overlay (decoder, position, loops), Esc quit.
On a Raspberry Pi 1 keep the clips small (four software or V4L2 decodes plus RGB conversion on one ARMv6 core);
`media/` has four 160x90 clips from `../make-media.sh`.
