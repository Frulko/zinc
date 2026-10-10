#!/usr/bin/env python3
"""Writes the scripted sessions of tests/t1/museum_mode.sh, on the sample project of examples/museum-table (1920x1080, one table unit per
pixel, 60 frames a second). Run it again only to change a session; the goldens then change with it.

sides.input, on the sequence of the vase (--sequence porcelain): a touch at each edge of the table in turn (the far side, the right, the
  left, the main side) turns the texts to that side, and a touch on a point of the vase then opens its panel, turned to that side.
two.input, two visitors on opposite long sides of the prints: the one at the main side opens a print in full and closes it; the one at
  the far side touches their edge, does the same with another print, and follows a link with the button at their edge; the first turns
  the table back and follows the next link. One story: each sequence comes once, for both.
idle.input: a visitor changes the language, moves a card, goes to another sequence and turns the table, then leaves. After 60 seconds the
  attract loop starts, after 120 the visit is forgotten; at frame 9000 somebody touches the table.
fresh.input: that same touch on a table just started, ten frames in: what the table shows 40 frames later must be what idle.input shows.
"""
import os, sys

def session(name, script):
    events = []
    def tap(frame, finger, x, y):
        events.append((frame, f"touch {finger} {x:.1f} {y:.1f}")); events.append((frame + 3, f"touchup {finger}"))
    def drag(frame, finger, x0, y0, x1, y1, frames):
        for i in range(frames + 1): events.append((frame + i, f"touch {finger} {x0 + (x1 - x0) * i / frames:.1f} {y0 + (y1 - y0) * i / frames:.1f}"))
        events.append((frame + frames + 1, f"touchup {finger}"))
    script(tap, drag)
    events.sort(key=lambda e: e[0])
    open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), name), "w").write("".join(f"{frame} {what}\n" for frame, what in events))

TOP, RIGHT, LEFT, BOTTOM = (960, 20), (1900, 540), (20, 540), (960, 1062)   # the middle of each edge: the mark that turns the table

MIDDLE = (960, 540)             # far from every edge: a touch there turns nothing
POINT = (700, 545)              # where the vase shows its point "cobalt" once it has come round to it: the middle of its box, at every side
BESIDE = (1000, 540)            # on the vase's box, on no point: a touch there closes the open panel

def sides(tap, drag):
    tap(10, 1, *TOP)
    tap(30, 2, 712, 526)        # "cobalt" where the vase first shows it, standing for the far side
    tap(110, 3, *BESIDE)
    tap(130, 4, *RIGHT)
    tap(170, 5, *POINT)
    tap(250, 6, *BESIDE)
    tap(270, 7, *LEFT)
    tap(310, 8, *POINT)
    tap(390, 9, *BESIDE)
    tap(410, 10, *BOTTOM)
    tap(450, 11, *POINT)

def two(tap, drag):
    tap(20, 1, 1010, 760); tap(28, 1, 1011, 761)        # the visitor at the main side: a double tap on the snow at Kanbara
    tap(80, 2, *MIDDLE)                                  # and a touch to close the full view
    tap(100, 8, *TOP)                                    # the visitor at the far side: a touch at their edge,
    tap(120, 3, 1030, 310); tap(128, 3, 1031, 311)      # and a double tap on the Red Fuji
    tap(190, 4, *MIDDLE)
    tap(230, 5, 1920 - 660, 1080 - 1030)                 # "Japonisme", the button at the far side's left... seen from the main side
    tap(300, 6, *BOTTOM)                                 # the first visitor turns the table back
    tap(340, 7, 960, 1030)                               # and follows "Blue and white"

def idle(tap, drag):
    tap(10, 1, 1804, 1030)                               # the language: English
    drag(30, 2, 1510, 340, 1400, 500, 30)                # a card moved
    tap(80, 3, 660, 1030)                                # "Japonisme"
    tap(140, 4, *TOP)                                    # the table turned to the far side
    tap(9000, 5, *MIDDLE)                                # after the attract loop (frame 3744) and the reset (frame 7344): a new visitor

def fresh(tap, drag):
    tap(10, 1, *MIDDLE)

session("sides.input", sides)
session("two.input", two)
session("idle.input", idle)
session("fresh.input", fresh)
