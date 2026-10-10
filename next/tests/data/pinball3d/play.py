#!/usr/bin/env python3
"""Writes the scripted game of tests/t1/pinball3d.sh (ZINC_INPUT): 60 seconds at 60 frames a second of a player who
cannot see: start, a full pull of the plunger every five seconds (it only shoots when a ball waits), the two flippers in
turn, and a bump now and then. The gamepad buttons are used because a script can hold and release them.
usage: play.py > play.input"""
FRAMES = 3600
events = [(20, 'pad Start'), (24, 'padup Start')]
for f in range(60, FRAMES, 300):
    events += [(f, 'pad Down'), (f + 70, 'padup Down')]
for f in range(150, FRAMES, 74):
    events += [(f, 'pad L'), (f + 9, 'padup L'), (f + 37, 'pad R'), (f + 46, 'padup R')]
for f in range(700, FRAMES, 1100):
    events += [(f, 'pad X'), (f + 3, 'padup X')]
for frame, what in sorted(events):
    print(frame, what)
