#!/usr/bin/env python3
"""Writes broken copies of a pinball table, one folder each, and the message each must give (tests/t1/pinball3d_format.sh).
usage: break.py <table.json> <out dir>      prints one line per case: <folder>\t<expected message>"""
import copy
import json
import os
import sys

src, out = sys.argv[1], sys.argv[2]
table = json.load(open(src))
cases = []


def case(name, change, expect):
    t = copy.deepcopy(table)
    change(t)
    cases.append((name, json.dumps(t, indent=1), expect))


def set_at(t, path, value):
    for key in path[:-1]:
        t = t[key]
    t[path[-1]] = value


case('number', lambda t: set_at(t, ['flippers', 1, 'length'], 'long'), 'flippers[1].length: must be a number from 2 to 30, not "long"')
case('typo', lambda t: set_at(t, ['bumpers', 0, 'surfce'], 'rubber'), 'bumpers[0].surfce: unknown field (did you mean "surface"?)')
case('reference', lambda t: set_at(t, ['walls', 2, 'surface'], 'rubberr'), 'walls[2].surface: "rubberr" is not one of the surfaces (wood, metal, rubber, plastic, wire, bat)')
case('missing', lambda t: t.pop('plunger'), 'plunger: is missing')
case('version', lambda t: set_at(t, ['version'], 2), 'version: this game reads tables up to version 1, the file is version 2')
case('profile', lambda t: set_at(t, ['ramps', 0, 'profile'], [[0, 0], [0.4, 5], [0.9, 5]]), 'ramps[0].profile[2]: the last row must end at 1 (the end of the path), not 0.9')
case('rule', lambda t: set_at(t, ['rules', 'when', 5, 'do', 0, 'target'], 'lanez'), 'rules.when[5].do[0].target: "lanez" is not one of the light groups (lanes, arrows, locks, ranks, gi, beaconLights)')
case('twice', lambda t: set_at(t, ['targets', 1, 'id'], 'drop1'), 'targets[1].id: "drop1" is used twice')
case('colour', lambda t: set_at(t, ['looks', 3, 'color'], 'red'), 'looks[3].color: must be a colour like "#40c8ff", not "red"')
case('event', lambda t: set_at(t, ['rules', 'missions', 2, 'steps', 1, 'event'], 'captured'), 'rules.missions[2].steps[1].event: must be one of hit, down, roll, spin, capture, eject,')
case('path', lambda t: set_at(t, ['walls', 0, 'points'], [[1, 2]]), 'walls[0].points: needs at least 2 rows, it has 1')
case('view', lambda t: set_at(t, ['layouts', 'portrait', 'view'], [0, 0, 0, 0]), 'layouts.portrait.view: the table needs a box with a width and a height, not 0 x 0')
case('range', lambda t: set_at(t, ['physics'], {'rate': 100}), 'physics.rate: must be a whole number from 240 to 4000, not 100')
case('list', lambda t: set_at(t, ['bumpers'], {'pop1': {}}), 'bumpers: must be a list, not an object')

for name, text, expect in cases:
    os.makedirs(os.path.join(out, name))
    open(os.path.join(out, name, 'table.json'), 'w').write(text)
    print(f'{name}\t{expect}')

# a file that is not JSON, and one with three faults at once
os.makedirs(os.path.join(out, 'notjson'))
open(os.path.join(out, 'notjson', 'table.json'), 'w').write(json.dumps(table)[:-40])
print('notjson\tthe file is not JSON')
t = copy.deepcopy(table)
t['name'] = ''
t['flippers'][0]['stroke'] = 'up'
t['lights'][0]['shape'] = 'star'
os.makedirs(os.path.join(out, 'three'))
open(os.path.join(out, 'three', 'table.json'), 'w').write(json.dumps(t))
print('three\tthe table has 3 faults')
