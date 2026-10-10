#!/usr/bin/env python3
"""Writes session.input, the scripted session of tests/t1/museum_viewer.sh on the vase of the sample (sequence "porcelain", 1920x1080, one
table unit per pixel). Run it again only to change the session; the goldens then change with it.

  5-29    one finger drags 257 units to the left and stops: the camera goes a quarter turn round the vase (yaw 20 to 110)
  40-60   two fingers spread from 200 to 320 units apart: the vase comes closer (distance 3.2 to 2.0)
  61-70   both move 60 units to the right and 30 down: the vase follows them
  85-88   a tap on the point "musicians" (where the log of a run puts it at frame 84): its description opens, the view glides to it
  140-143 a tap on "Vue de depart": the view glides back to the start
  195-198 a tap on the lighting button: raking light
"""
import sys

events = []
def touch(frame, finger, x, y): events.append((frame, f"touch {finger} {x:.1f} {y:.1f}"))
def lift(frame, finger): events.append((frame, f"touchup {finger}"))

x = 900.0
for f in range(5, 30):
    touch(f, 1, x, 600)
    if f < 25: x -= 257 / 20
lift(30, 1)

for f in range(40, 71):
    spread = 100 + 60 * min(1, (f - 40) / 20)      # half the distance between the fingers
    dx, dy = (6 * max(0, f - 60), 3 * max(0, f - 60))
    touch(f, 1, 700 - spread + dx, 560 + dy)
    touch(f, 2, 700 + spread + dx, 560 + dy)
lift(71, 1); lift(71, 2)

MUSICIANS = (793, 697)   # "point musicians at ..." of the log at frame 84
touch(85, 3, *MUSICIANS); lift(88, 3)
touch(140, 3, 523, 906); lift(143, 3)       # the button "Vue de depart"
touch(195, 3, 322, 906); lift(198, 3)       # the lighting button

events.sort(key=lambda e: e[0])
open(sys.argv[1], "w").write("".join(f"{frame} {what}\n" for frame, what in events))
