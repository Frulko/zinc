#!/usr/bin/env python3
"""Writes hands.input, the scripted session of tests/demo/museum_table.sh: two hands on two cards of the sample's first sequence at once
(1920x1080, one table unit per pixel). Run it again only to change the session; the goldens then change with it.

  hand 1 on the Great Wave: one finger drags (5-24), a second finger lands (25) and the pair turns and spreads while the first keeps
         moving (26-55), the first finger lifts (56), the second drags on alone (57-64) and lets go (65): the card glides.
  hand 2 on the snow at Kanbara, at the same time: one finger drags (10-29), a second lands (30), they pinch in (31-49), the second lifts (50),
         the first flicks to the right (51-57) and lets go (58).
  then one finger: a tap on the folded corner of the Red Fuji turns it over (80-84); a double tap on Ejiri opens the full
         view (110-121); a tap closes it (140-143).
"""
import math, sys

events = []
def touch(frame, finger, x, y): events.append((frame, f"touch {finger} {x:.1f} {y:.1f}"))
def lift(frame, finger): events.append((frame, f"touchup {finger}"))

# hand 1, fingers 1 and 3, on the Great Wave (centre 480, 340)
x1, y1 = 430.0, 330.0
for f in range(5, 56):
    if f > 5: x1, y1 = (x1 + 5, y1 + 2) if f < 25 else (x1 + 1, y1 + 1)
    touch(f, 1, x1, y1)
    if f >= 25:
        t = (f - 25) / 30                      # the second finger swings from 8 to 50 degrees and from 141 to 230 units away
        a, d = math.radians(8 + 42 * t), 141 + 89 * t
        x3, y3 = x1 + d * math.cos(a), y1 + d * math.sin(a)
        touch(f, 3, x3, y3)
lift(56, 1)
for f in range(56, 65):
    x3, y3 = x3 - 4, y3 + 3
    touch(f, 3, x3, y3)
lift(65, 3)

# hand 2, fingers 2 and 4, on the snow at Kanbara (centre 1010, 760)
x2, y2 = 980.0, 760.0
for f in range(10, 58):
    if f > 10: x2, y2 = (x2 + 3, y2 - 4) if f < 30 else (x2 + 2, y2) if f < 50 else (x2 + 14, y2 + 2)
    touch(f, 2, x2, y2)
    if 30 <= f < 50:
        d = 124 - 54 * (f - 30) / 19           # the second finger closes in from 124 to 70 units
        touch(f, 4, x2 - d * math.cos(0.25), y2 + d * math.sin(0.25))
lift(50, 4)
lift(58, 2)

touch(80, 5, 1202, 468); lift(84, 5)                               # the folded corner of the Red Fuji
touch(110, 6, 1510, 330); lift(113, 6); touch(118, 6, 1511, 331); lift(121, 6)   # double tap on Ejiri
touch(140, 7, 600, 500); lift(143, 7)                              # anywhere: the full view closes

events.sort(key=lambda e: e[0])
open(sys.argv[1], "w").write("".join(f"{frame} {what}\n" for frame, what in events))
