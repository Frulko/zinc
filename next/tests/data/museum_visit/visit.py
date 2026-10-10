#!/usr/bin/env python3
"""Writes visit.input and wait.input, the scripted sessions of tests/t1/museum_visit.sh, on the sample project of examples/museum-table
(1920x1080, one table unit per pixel, 60 frames a second). Run it again only to change a session; the goldens then change with it.

visit.input, one visitor:
  150  a tap on the hotspot of the Great Wave: "The Great Wave, up close" opens over the prints (an overlay, fade)
  210  its button "Back to the prints": the overlay closes at once (transition none) and the prints are as they were left
  230  the button "Japonisme": a fade to that sequence, whose text card comes after two seconds
  400  the button "Blue and white": the vase slides in
  450  the button "A garden in Japan": the panorama slides in
  500  a finger looks to the right in the panorama (500-530), which goes on turning; 640: a tap on the point "The path up the hill"
  700  the button of its panel leads back to "Japonisme" (fade)
  790  the language button: every text of the sequence is in English
  900  the button "Map": the storyboard, with the five sequences seen ticked and the links followed in the accent colour
  950  a touch on the node "Blue and White": the storyboard closes and the table fades to that sequence
wait.input: the hotspot again, and nothing more: after its 30 seconds the overlay gives way to its `next`, the prints underneath.
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

HOTSPOT = (478, 312)            # the middle of the Great Wave's picture, on its card turned by -4 degrees
LEFT, MIDDLE, RIGHT, LANGUAGE = (660, 1030), (960, 1030), (1260, 1030), (1804, 1030)   # the buttons at the visitor's edge

def visit(tap, drag):
    tap(150, 1, *HOTSPOT)
    tap(210, 2, *MIDDLE)
    tap(230, 3, *LEFT)
    tap(400, 4, *MIDDLE)
    tap(450, 5, *RIGHT)
    drag(500, 6, 1250, 520, 650, 500, 30)
    tap(640, 7, 1250, 423)
    tap(700, 8, 1480, 376)
    tap(790, 9, *LANGUAGE)
    tap(900, 10, 90, 1030)
    tap(950, 11, 1572, 700)

def wait(tap, drag):
    tap(150, 1, *HOTSPOT)

session("visit.input", visit)
session("wait.input", wait)
