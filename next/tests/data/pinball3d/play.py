#!/usr/bin/env python3
"""Writes the scripted game of tests/t1/pinball3d.sh (ZINC_INPUT): 60 seconds at 60 frames a second of a player who
cannot see: start, a full pull of the plunger every five seconds (it only shoots when a ball waits), the two flippers in
turn, and a bump now and then. The gamepad buttons are used because a script can hold and release them.
--gamepad writes the same hands on a plugged gamepad instead (ZN-649.07): start, the plunger on the south button, the
flippers on the two triggers, the bump on the west button.
usage: play.py [--gamepad] > play.input"""
import sys
FRAMES = 3600
events = [(20, 'pad Start'), (24, 'padup Start')]
for f in range(60, FRAMES, 300):
    events += [(f, 'pad Down'), (f + 70, 'padup Down')]
for f in range(150, FRAMES, 74):
    events += [(f, 'pad L'), (f + 9, 'padup L'), (f + 37, 'pad R'), (f + 46, 'padup R')]
for f in range(700, FRAMES, 1100):
    events += [(f, 'pad X'), (f + 3, 'padup X')]
GAMEPAD = {'Start': 9, 'Down': 0, 'L': 6, 'R': 7, 'X': 2}   # the W3C index of the button that does the same
if '--gamepad' in sys.argv:
    print('0 gamepad 0')
for frame, what in sorted(events):
    kind, button = what.split()
    print(frame, f"{'gbutton' if kind == 'pad' else 'gbuttonup'} 0 {GAMEPAD[button]}" if '--gamepad' in sys.argv else what)
