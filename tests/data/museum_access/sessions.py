#!/usr/bin/env python3
"""Writes the scripted sessions of tests/demo/museum_access.sh, on the sample project of examples/museum-table (1920x1080, one table unit per
pixel, 60 frames a second). Run it again only to change a session; the goldens then change with it. Where a button is at a text size and
at a side of the table is what the player prints with --controls.

sizes.input, on the prints: the text size button twice (1.3, then 1.6, the largest), the high contrast, the text size again (back to 1,
  then 1.3); the visitor then leaves. After 60 seconds the attract loop starts, after 120 the visit is forgotten, and at frame 9000
  somebody touches the table: 40 frames later it must show what a table just started shows (tests/data/museum_mode/fresh.input).
object.input, on the vase (--sequence porcelain): the largest text and the high contrast; "Next point" opens the first point of interest
  without a touch on the object; the table is turned to each of its sides; back at the designed size, to each of its sides again.
reach.input, on the panorama (--sequence garden): "Next point" twice, which opens a panel with a button; the table turned to each of its
  sides; the storyboard, closed by a touch beside its nodes; a link to the prints, and one of them seen in full.
voice.input, on the prints: a double tap opens the snow at Kanbara in full; "Audio description" says it; the language button says it
  again in English; the same button stops it; it is asked again and the full view is closed, which stops it too. Then the vase: its
  audio description, played to its end; and the panorama's, stopped by leaving the sequence.
"""
import os, sys

def session(name, script):
    events = []
    def tap(frame, finger, x, y):
        events.append((frame, f"touch {finger} {x:.1f} {y:.1f}")); events.append((frame + 3, f"touchup {finger}"))
    script(tap)
    events.sort(key=lambda e: e[0])
    open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), name), "w").write("".join(f"{frame} {what}\n" for frame, what in events))

TOP, RIGHT, LEFT, BOTTOM = (960, 20), (1900, 540), (20, 540), (960, 1062)   # the middle of each edge: a touch there turns the table
MIDDLE = (960, 540)
# the visitor's settings at the main side, at the three text sizes of the sample
TEXT = {1: (1513, 1030), 1.3: (1415, 1022), 1.6: (1317, 1013)}
CONTRAST = {1: (1661, 1030), 1.3: (1603, 1022), 1.6: (1544, 1013)}
LANGUAGE = {1: (1804, 1030), 1.3: (1784, 1022), 1.6: (1763, 1013)}
KANBARA = (1010, 760)           # a print of the first sequence

def sizes(tap):
    tap(20, 1, *TEXT[1])
    tap(40, 2, *TEXT[1.3])
    tap(80, 3, *CONTRAST[1.6])
    tap(120, 4, *TEXT[1.6])
    tap(160, 5, *TEXT[1])
    tap(9000, 6, *MIDDLE)

def object(tap):
    tap(20, 1, *TEXT[1])
    tap(40, 2, *TEXT[1.3])
    tap(60, 3, *CONTRAST[1.6])
    tap(110, 4, 1392, 801)       # "Next point", in the row of the object's buttons at the largest size
    tap(180, 5, *TOP)
    tap(210, 6, *RIGHT)
    tap(240, 7, *LEFT)
    tap(270, 8, *BOTTOM)
    tap(300, 9, *TEXT[1.6])      # back to the designed size
    tap(330, 10, *TOP)
    tap(360, 11, *RIGHT)
    tap(390, 12, *LEFT)
    tap(420, 13, *BOTTOM)

def reach(tap):
    tap(20, 1, 559, 836)         # "Next point" under the panorama: the stone garden
    tap(70, 2, 559, 836)         # again: the path up the hill, whose panel has a button
    tap(140, 3, *TOP)
    tap(170, 4, *RIGHT)
    tap(200, 5, *LEFT)
    tap(230, 6, *BOTTOM)
    tap(270, 7, 100, 1030)       # "Map"
    tap(320, 8, 1572, 338)       # beside the nodes: the map closes
    tap(360, 9, 660, 1030)       # "The floating world"
    tap(440, 10, *KANBARA); tap(448, 10, KANBARA[0] + 1, KANBARA[1] + 1)

def voice(tap):
    tap(20, 1, *KANBARA); tap(28, 1, KANBARA[0] + 1, KANBARA[1] + 1)
    tap(60, 2, 341, 1030)        # "Audio description", beside "Close" at the visitor's edge
    tap(130, 3, *LANGUAGE[1])
    tap(200, 4, 309, 1030)       # the same button: "Stop the description"
    tap(260, 5, 310, 1030)       # and again
    tap(320, 6, *MIDDLE)         # the full view closes
    tap(360, 7, 960, 1030)       # "Blue and white"
    tap(440, 8, 718, 906)        # "Audio description" under the vase: 8.7 seconds, left to its end
    tap(1020, 9, 1260, 1030)     # "A garden in Japan"
    tap(1100, 10, 352, 836)      # "Audio description" in the panorama
    tap(1160, 11, 660, 1030)     # "The floating world": leaving the sequence stops it

session("sizes.input", sizes)
session("object.input", object)
session("reach.input", reach)
session("voice.input", voice)
