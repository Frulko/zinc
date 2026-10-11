#!/usr/bin/env python3
"""Writes the editor sessions of the guided rules (ZN-649.14), with the typist that typed Twilight Fair
(examples/pinball3d/tools/twilight_fair/typist.py): what a person does in the table editor, one event per line, on the
table kept with the tests (table.json, Tidal Lock of 2026-10-10). The sessions are kept beside this script; the tests
(tests/t1/pinball3d_editor.sh for rules.input, tests/t1/pinball3d_editor_rules.sh for the others) replay them and
compare the table each saves with its golden.

How a session reaches things, as every session of the editor does: a thing by its name with Cmd+G, a field of the selection
by its key with Cmd+F (which leaves it alone at the top of the form: "do[1].target" is the target of the second thing a rule
does), never by the place of a line. What is then done to it is what a person does: a click on the button Add and on a line
of the list of kinds it opens, a click on a line of a short list, a few letters typed in the box of a long one to find a
name in it, a number or a text typed. No name is typed in a text field, no path, nothing as the file has it.

usage: guided.py [folder]    (writes the .input files in the folder; without one, beside itself; prints the frames to capture)"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', '..', 'examples', 'pinball3d', 'tools', 'twilight_fair'))
from typist import Session, FIELD_X   # noqa: E402

TESTS = ['counter', 'lights', 'targets', 'mode', 'rank', 'mission', 'balls']
DO = ['score', 'bonus', 'multiplier', 'light', 'count', 'reset', 'say', 'sound', 'award', 'rotate']
# the first sentence of a list left alone at the top of the form: the buttons at its right (another kind, up, take away), the
# first line of the list of kinds the first one opens, and how far down the second sentence is when the first fits on one line
CARD_Y, CARD_KIND_X, CARD_UP_X, CARD_REMOVE_X, CARD_FIRST_LINE, CARD_NEXT = 152, 1368, 1384, 1403, 180, 38


def rules():
    s = Session('The table editor, sounds and rules (tests/t1/pinball3d_editor.sh), window 1440x900. Written by guided.py.\n'
                'A sound: "+sound" adds one (a generated tone until it names a file); its pitch is typed.')
    s.goto('+sound')
    s.set('hz', 880)
    s.note('The first bumper plays it when it is hit: the sound is chosen in the list of the table\'s sounds (its second line,\n'
           'after "none"), and the button beside it lets it be heard.')
    s.goto('pop1')
    s.choose_line('sounds.hit', 1)
    s.click(1383, 112)
    shots = [s.frame]
    s.rest()
    s.note('The music of a ball in play is the same sound.')
    s.goto('music')
    s.choose_line('play', 1)
    s.note('A rule: "+rule" adds one and opens it. Where the event comes from and the event are chosen in their lists; what it\n'
           'does is already there (100 points), and its points are typed.')
    s.goto('+rule')
    s.choose('on', 'pop1')
    s.choose('event', 'hit')
    s.set('do[0].value', 300)
    s.note('A mission: "+mission" adds one with a step; its name is typed; its step waits for a hit (the event, chosen among\n'
           'the events) of the group of the bumpers (chosen among what can be hit), three times.')
    s.goto('+mission')
    s.set('name', 'Bumpers')
    s.choose('steps[0].event', 'hit')
    s.choose('steps[0].on', 'pops')
    s.set('steps[0].count', 3)
    s.note('The rules of the game itself: the ball save, the warnings before a tilt, the balls of multiball.')
    s.goto('rules')
    s.set('ballSave', 12)
    s.set('tilt.warnings', 3)
    s.set('multiball.balls', 2)
    s.save()
    shots.append(s.frame)
    return s, shots


def conditions():
    s = Session('The table editor, conditions and actions made from choices (tests/t1/pinball3d_editor_rules.sh). Written by guided.py.\n'
                'A rule that acts when every lane light is on. Its condition is added by its kind and is whole at once: the\n'
                'editor gives it the first group of lights of the table, the lanes. The 100 points a new rule gives become\n'
                'another kind of action, in the list of kinds of the field; two more are added.')
    s.goto('+rule')
    s.choose('on', 'lanes')
    s.choose('event', 'roll')
    s.add_kind('if', TESTS.index('lights'))
    s.choose_line('do[0].do', DO.index('multiplier'))
    s.add_kind('do', DO.index('light'))
    s.choose_line('do[1].mode', 1)   # turn off
    s.add_kind('do', DO.index('say'))
    s.set('do[2].target', 'ALL LANES')
    shots = [s.frame]
    s.rest()
    s.note('A rule on the bank of drop targets: when they are all down (the editor gives the bank by itself) and the counter\n'
           'of laps is at least 2. It scores, raises the bank, gives a ball save of 15 seconds and sets the counter to 0.')
    s.goto('+rule')
    s.choose('on', 'bank')
    s.choose('event', 'down')
    s.add_kind('if', TESTS.index('targets'))
    s.add_kind('if', TESTS.index('counter'))
    s.set('if[1].value', 2)
    s.set('do[0].value', 10000)
    s.add_kind('do', DO.index('reset'))
    s.add_kind('do', DO.index('award'))
    s.choose_line('do[2].mode', 1)   # a ball save
    s.set('do[2].seconds', 15)
    s.add_kind('do', DO.index('count'))
    s.choose_line('do[3].mode', 1)   # set to
    s.set('do[3].value', 0)
    s.note('A rule of the game itself, with the other kinds of condition: the rank, the mode, the mission, the balls in play.\n'
           'A light is found in the long list of the table\'s lights by a few letters; the lane lights shift the other way.')
    s.goto('+rule')
    s.choose('on', 'game')
    s.choose('event', 'rankUp')
    s.add_kind('if', TESTS.index('rank'))
    s.choose_line('if[0].is', 2)   # exactly
    s.set('if[0].value', 2)
    s.add_kind('if', TESTS.index('mode'))
    s.choose_line('if[1].target', 1)   # multiball
    s.add_kind('if', TESTS.index('mission'))
    s.add_kind('if', TESTS.index('balls'))
    s.choose_line('if[3].is', 1)   # less than
    s.set('if[3].value', 3)
    s.choose_line('do[0].do', DO.index('light'))
    s.choose('do[0].target', 'extra')
    s.choose_line('do[0].mode', 2)   # blink
    s.add_kind('do', DO.index('rotate'))
    s.set('do[1].value', -1)
    s.add_kind('do', DO.index('bonus'))
    s.set('do[2].value', 750)
    s.note('This table has no sound: a sound to play cannot be added, and the editor says what is missing.')
    s.add_kind('do', DO.index('sound'))
    s.note('The buttons at the right of a sentence. The second thing the rule does (shift the lights) goes up one place; what is\n'
           'now first becomes a text to show; the first condition (the rank) is taken away.')
    s.find('do')
    s.click(CARD_UP_X, CARD_Y + CARD_NEXT)
    s.find('do')
    s.click(CARD_KIND_X, CARD_Y)
    s.click(FIELD_X, CARD_FIRST_LINE + 24 * DO.index('say'))
    s.find('if')
    s.click(CARD_REMOVE_X, CARD_Y)
    shots.append(s.frame)
    s.rest()
    s.save()
    return s, shots


def cell(s, name, nth, points):
    """A cell of the scores grid: the row found by its name in the box of the grid (Cmd+K), which leaves it first; Tab then goes
    from the box to its cells, one per event the thing sends; a number is typed."""
    s.key('k', 'meta')
    s.text(name)
    s.rest()
    for _ in range(nth + 1):
        s.key('Tab')
    s.text(points)
    s.key('Enter')
    s.rest()


def scores():
    s = Session('The table editor, the scores as a grid (tests/t1/pinball3d_editor_rules.sh). Written by guided.py.\n'
                'The rules themselves selected, the grid takes the place of the top view. The bumpers give 750 points for a hit\n'
                'instead of 500: the number of the rule that scores there. The lanes have three rules for a ball that rolls over\n'
                'them; the cell is the one without a condition.')
    s.goto('rules')
    cell(s, 'pops', 0, 750)
    cell(s, 'lanes', 0, 350)
    shots = [s.frame]
    s.rest()
    s.note('A gate that scored nothing gets a rule; a flipper whose rule shifts the lane lights now scores too, in that rule.')
    cell(s, 'laneGate', 0, 150)
    cell(s, 'left', 0, 25)
    s.note('The bank of drop targets has two cells, hit and down: the second is its 2000 points. 0 empties a cell: the standup\n'
           'targets keep their bonus and score nothing, the rule of the slingshots, which only scored, goes.')
    cell(s, 'bank', 1, 2500)
    cell(s, 'stand', 0, 0)
    cell(s, 'slings', 0, 0)
    s.save()
    return s, shots


# the buttons of the selection, under its title: the arrow that moves it one place up in its list
UP_X, UP_Y = 1190, 295


def mission():
    s = Session('The table editor, a mission made of sentences (tests/t1/pinball3d_editor_rules.sh). Written by guided.py.\n'
                '"+mission" adds one, with a step; its name is typed. The step becomes "Hit ...": its event is chosen in the list\n'
                'of events, and the editor gives it the first group that can be hit, the bumpers.')
    s.goto('+mission')
    s.set('name', 'Deep Scan')
    s.choose('steps[0].event', 'hit')
    s.note('Two more steps, each added by its event in the list the button Add opens. A ball that rolls over a switch: the editor\n'
           'gives the lanes. A hit again, of the standup targets this time, found in the list of what can be hit; twice; and the\n'
           'light that blinks while it is the step to do, chosen among the lights. No text is typed: the panel will ask for\n'
           '"Hit pops", "Roll over lanes", "Hit stand 2 times".')
    s.add_kind('steps', 0, typed='roll')
    s.add_kind('steps', 0, typed='hit')
    s.choose('steps[2].on', 'stand')
    s.set('steps[2].count', 2)
    s.choose('steps[2].light', 'bankArrow')
    shots = [s.frame]
    s.rest()
    s.note('The mission goes first, so that a game starts with it: the whole form again (Escape in the box that finds a field),\n'
           'then the arrow under its title, once per mission before it.')
    s.key('f', 'meta')
    s.key('Escape')
    s.rest()
    shots.append(s.frame)
    for _ in range(6):
        s.click(UP_X, UP_Y)
    shots.append(s.frame)
    s.save()
    return s, shots


def delete():
    s = Session('The table editor, a deletion that takes rules with it (tests/t1/pinball3d_editor_rules.sh). Written by guided.py.\n'
                'The dock is clicked on the top view, and Delete is pressed. Three rules listen to the dock and a mission waits for\n'
                'it: the editor says which would go with it, and waits. Escape leaves everything as it is.')
    s.at(40.5, 24.5)
    s.key('Delete')
    s.rest()
    shots = [s.frame]
    s.key('Escape')
    s.rest()
    s.note('Delete again, and Enter this time: the dock goes, with the three rules and the mission.')
    s.key('Delete')
    s.rest()
    s.key('Enter')
    s.rest()
    s.save()
    return s, shots


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else HERE
    for name, make in (('rules', rules), ('conditions', conditions), ('scores', scores), ('mission', mission), ('delete', delete)):
        s, shots = make()
        s.lines.append(f'# frames {s.frame + 6}')
        s.write(os.path.join(out, f'{name}.input'))
        print(f'{name}.input  frames {s.frame + 6}  capture {",".join(str(f) for f in shots)}')


if __name__ == '__main__':
    main()
