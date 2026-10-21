#!/usr/bin/env python3
"""Writes the editor sessions that make the table Twilight Fair (sessions/*.input), with the typist of typist.py.

The sessions are what a person does in the table editor, in order, starting from the table the editor's own test makes
from nothing (tests/golden/pinball3d-editor/new.json: a board, an arch, a plunger lane, two flippers, three
bumpers, three targets) in a folder that already holds the table's art/ and sounds/ (tools/twilight_fair_art.py and
tools/twilight_fair_sounds.py). tests/demo/pinball3d_second_table.sh replays them and checks that the result is,
byte for byte, assets/tables/twilight-fair/table.json. No line of that file was typed outside the editor.

usage: sessions.py [folder]     (writes 01-layout.input ... in the folder; without one, in sessions/ beside itself)"""
import math, os, sys
from typist import Session

HERE = os.path.dirname(os.path.abspath(__file__))
WARM = ['#ffcf5a', '#ff8a4a', '#fff0c8']


def named(s, name, group=None):
    s.set('id', name)
    if group is not None:
        s.set('group', group)


def layout():
    s = Session('Twilight Fair, 1: what the ball meets. From the starter table: its things renamed, slingshots, the top lanes,\n'
                'the coconut shy, the spinner, the high striker and the bandstand it throws the ball onto.')
    s.away()
    s.set('name', 'Twilight Fair')
    s.set('author', 'Zinc')
    s.set('description', 'A funfair at dusk: ring the bell of the high striker, clear the coconut shy, ride the carousel.')
    for old, new in (('wall1', 'outer'), ('wall2', 'guideLeft'), ('wall3', 'guideRight'), ('flipper1', 'left'), ('flipper2', 'right')):
        s.goto(old)
        named(s, new)
    s.note('The slingshots: the left one from its upper end to its lower one (it kicks to the left of that way), and its mirror image.')
    s.place('slingshot', [(9.5, 73), (13, 82)])
    named(s, 'slingLeft', 'slings')
    s.set('kick', 130)
    s.away()
    s.at(11.25, 77.5)   # a click on it selects it again, and M adds its mirror image
    s.key('m')
    s.rest()
    s.note('The top lanes: two dividers, a switch across each lane.')
    s.place('lane-guide', [(19.5, 14), (19.5, 20)], path=True)
    named(s, 'divider1')
    s.place('lane-guide', [(28, 14), (28, 20)], path=True)
    named(s, 'divider2')
    for i, (a, b) in enumerate((((13.5, 17), (19, 17)), ((20, 17), (27.5, 17)), ((28.5, 17), (34, 17)))):
        s.place('rollover', [a, b])
        named(s, f'lane{i + 1}', 'lanes')
    s.note('The coconut shy: three drop targets along the plunger lane, facing the table.')
    for i in range(3):
        s.place('drop-target', [(45.5, 60 + 4 * i)])
        named(s, f'coconut{i + 1}', 'coconuts')
        s.set('at', 45.9, 60 + 4 * i)
        s.set('angle', 180)
    s.note('The ducks: the three targets of the starter table.')
    for i in range(3):
        s.goto(f'target{i + 1}')
        named(s, f'duck{i + 1}', 'ducks')
    s.note('The spinner across the right-hand way down, and the bumpers a little stronger.')
    s.place('spinner', [(39.5, 52), (46, 52)])
    named(s, 'spinner')
    for i in range(3):
        s.goto(f'bumper{i + 1}')
        s.set('kick', 150)
    s.note('The high striker: a hole that holds the ball, then throws it up onto the bandstand, an upper playfield whose rail\n'
           'leads the ball to a gap at its lower right corner. Two bells stand on it.')
    s.place('kicker', [(9, 31)])
    named(s, 'striker')
    s.set('hold', 0.8)
    s.set('exit', 1, -12, 5)
    s.set('angle', -90)
    s.set('speed', 150)
    s.place('floor', [(5, 10), (19, 10), (19, 24), (5, 24)], path=True)
    named(s, 'bandstand')
    s.choose_line('surface', 1)
    s.away()
    s.note('L goes to the level of the bandstand: what is placed now stands on it.')
    s.key('l')
    s.key('l')
    s.rest()
    s.place('wall', [(15, 23), (6, 21), (6, 11), (18, 11), (18, 20)], path=True)
    named(s, 'rail')
    for i, x in enumerate((10, 14.5)):
        s.place('standup-target', [(x, 12)])
        named(s, f'bell{i + 1}', 'bells')
    s.away()
    s.key('l')
    s.save()
    return s


LOOKS = [   # name, what is set: colours typed, images chosen in the folder
    ('board', {'color': '#f0e4dc', 'texture': 'art/playfield.jpg'}),
    ('steel', {'color': '#c9a24a', 'specular': '#fff0c0'}),
    ('chrome', {'color': '#ffffff', 'texture': 'art/ball.jpg'}),
    ('looks[3]', {'color': '#b3261e'}),   # the look "rubber": the surface of that name comes first in the file
    ('looks[4]', {'color': '#ffffff', 'texture': 'art/flipper.png'}),   # the look "bat"
    ('bumper', {'color': '#7a1f2c', 'glow': '#ffcf5a'}),
    ('cap', {'color': '#ffffff', 'texture': 'art/cap.png'}),
    ('target', {'color': '#e8c040', 'glow': '#fff0a0'}),
    ('+coconut', {'color': '#8a5a34', 'glow': '#ffb060'}),
    ('+band', {'color': '#d8342c', 'glow': '#ff9a5a'}),
    ('+deckBoard', {'color': '#ffffff', 'texture': 'art/deck.jpg'}),
    ('+cabinet', {'color': '#3a1420', 'flat': True}),
    ('+backboard', {'color': '#ffffff', 'flat': True, 'texture': 'art/backboard.jpg'}),
    ('+apron', {'color': '#ffffff', 'flat': True, 'texture': 'art/apron.jpg'}),
    ('+parts', {'color': '#ffffff', 'flat': True, 'texture': 'art/palette.png'}),
    ('+tent', {'color': '#ffffff', 'texture': 'art/tent.png'}),
]
SOUNDS = [   # name, file, volume, variation of the volume and of the pitch, loop
    ('flipUp', 'flipper-up', 0.8, 0.1, 0.05, False), ('flipDown', 'flipper-down', 0.6, 0.1, 0.05, False), ('slingKnock', 'sling', 0.8, 0.1, 0.06, False),
    ('duckPlink', 'duck', 0.5, 0.1, 0.04, False), ('coconutKnock', 'coconut', 0.7, 0.1, 0.05, False), ('coconutUp', 'coconut-up', 0.4, 0, 0, False),
    ('laneChime', 'lane', 0.45, 0, 0.02, False), ('spinTick', 'spinner', 0.3, 0.1, 0.1, False), ('gateTick', 'gate', 0.3, 0.1, 0.1, False),
    ('mallet', 'mallet', 0.9, 0, 0, False), ('strikerBell', 'striker', 0.7, 0, 0, False), ('bigBell', 'big-bell', 0.7, 0, 0.02, False),
    ('plungerPull', 'plunger-pull', 0.3, 0, 0, False), ('plungerShot', 'plunger-shot', 0.8, 0, 0.04, False), ('drainWhistle', 'drain', 0.6, 0, 0, False),
    ('ballRoll', 'ball-roll', 0.5, 0, 0, True), ('ballLand', 'ball-land', 0.7, 0.1, 0.1, False), ('ballKnock', 'ball-knock', 0.5, 0.15, 0.12, False),
    ('wallKnock', 'wall', 0.4, 0.2, 0.15, False), ('cabinetKnock', 'nudge', 0.7, 0, 0, False), ('letterKey', 'letter', 0.4, 0, 0, False),
    ('jingleStart', 'start', 0.45, 0, 0, False), ('jingleBall', 'ball-ready', 0.4, 0, 0, False), ('jingleSaved', 'ball-saved', 0.45, 0, 0, False),
    ('jingleTilt', 'tilt', 0.5, 0, 0, False), ('jingleMission', 'mission', 0.5, 0, 0, False), ('jingleRank', 'rank', 0.4, 0, 0, False),
    ('jingleExtra', 'extra-ball', 0.45, 0, 0, False), ('jingleJackpot', 'jackpot', 0.6, 0, 0, False), ('jingleOver', 'game-over', 0.45, 0, 0, False),
    ('musicPlay', 'music-play', 0.3, 0, 0, True), ('musicAttract', 'music-attract', 0.28, 0, 0, True), ('musicOver', 'music-over', 0.35, 0, 0, False),
]
HEARD = [   # thing, then the event of it and the sound it plays
    ('bumper2', 'hit', 'bumperBell'), ('bumper3', 'hit', 'bumperBell'), ('slingLeft', 'hit', 'slingKnock'), ('slingRight', 'hit', 'slingKnock'),
    ('duck1', 'hit', 'duckPlink'), ('duck2', 'hit', 'duckPlink'), ('duck3', 'hit', 'duckPlink'), ('bell1', 'hit', 'bigBell'), ('bell2', 'hit', 'bigBell'),
    ('coconut1', 'hit', 'coconutKnock'), ('coconut1', 'reset', 'coconutUp'), ('coconut2', 'hit', 'coconutKnock'), ('coconut2', 'reset', 'coconutUp'),
    ('coconut3', 'hit', 'coconutKnock'), ('coconut3', 'reset', 'coconutUp'), ('lane1', 'roll', 'laneChime'), ('lane2', 'roll', 'laneChime'), ('lane3', 'roll', 'laneChime'),
    ('spinner', 'spin', 'spinTick'), ('striker', 'capture', 'mallet'), ('striker', 'eject', 'strikerBell'), ('left', 'up', 'flipUp'), ('left', 'down', 'flipDown'),
    ('right', 'up', 'flipUp'), ('right', 'down', 'flipDown'), ('plunger', 'pull', 'plungerPull'), ('plunger', 'release', 'plungerShot'), ('laneGate', 'pass', 'gateTick'),
    ('outer', 'hit', 'wallKnock'), ('shooterLane', 'hit', 'wallKnock'), ('guideLeft', 'hit', 'wallKnock'), ('guideRight', 'hit', 'wallKnock'),
    ('divider1', 'hit', 'wallKnock'), ('divider2', 'hit', 'wallKnock'), ('rail', 'hit', 'wallKnock'),
]


def looks_and_sounds():
    s = Session('Twilight Fair, 2: what it looks like and what is heard. The looks take the colours of the fair and the images of\n'
                'the folder; every sound is a file of the folder, and every thing names the sound of each of its events.')
    for name, what in LOOKS:
        if name.startswith('+'):
            s.goto('+look')
            named(s, name[1:])
        else:
            s.goto(name)
        for field in ('color', 'specular', 'glow'):
            if field in what:
                s.color(field, what[field])
        if what.get('flat'):
            s.segment('shading', 1, 3)
        if 'texture' in what:
            s.choose('texture', what['texture'])
    s.note('Who wears what: the slingshots, the coconuts, the bandstand.')
    for thing, look in (('slingLeft', 'band'), ('slingRight', 'band'), ('coconut1', 'coconut'), ('coconut2', 'coconut'), ('coconut3', 'coconut'), ('bandstand', 'deckBoard')):
        s.goto(thing)
        s.choose('look', look)
    s.note('The sounds. The one the starter table had becomes the bell of the bumpers.')
    s.goto('sound1')
    named(s, 'bumperBell')
    s.choose('file', 'sounds/bumper.mp3')
    s.set('volume', 0.7)
    s.set('pitchVariation', 0.05)
    for name, file, volume, vv, pv, loop in SOUNDS:
        s.goto('+sound')
        named(s, name)
        s.choose('file', f'sounds/{file}.mp3')
        s.set('volume', volume)
        if vv:
            s.set('volumeVariation', vv)
        if pv:
            s.set('pitchVariation', pv)
        if loop:
            s.switch('loop')
    s.note('Each event of each thing plays its sound; the ball has its own; the music of each state of the game.')
    for thing, event, sound in HEARD:
        s.goto(thing)
        s.choose(f'sounds.{event}', sound)
    s.goto('physics')
    for event, sound in (('roll', 'ballRoll'), ('hit', 'ballKnock'), ('land', 'ballLand'), ('knock', 'ballKnock')):
        s.choose(f'ball.sounds.{event}', sound)
    s.goto('music')
    for state, sound in (('attract', 'musicAttract'), ('play', 'musicPlay'), ('multiball', 'musicPlay'), ('gameOver', 'musicOver')):
        s.choose(state, sound)
    s.save()
    return s


def light(s, entry, name, group, x, y, color, glow, size=None, angle=None):
    s.place(entry, [(round(x * 2) / 2, round(y * 2) / 2)])
    named(s, name, group)
    s.set('at', round(x, 2), round(y, 2))
    s.color('color', color)
    s.set('glow', glow)
    if size is not None:
        s.set('size', size)
    if angle is not None:
        s.set('angle', angle)


MODELS = [   # name, group, palette entry, at, scale, look, mesh, what the ball does with it
    ('railLeft', 'cabinet', 'box', (-1.1, 53.5, 1.5), (2.2, 112.4, 9), 'cabinet', None), ('railRight', 'cabinet', 'box', (52.1, 53.5, 1.5), (2.2, 112.4, 9), 'cabinet', None),
    ('backboard', 'cabinet', 'box', (25.5, -1.1, 4), (55.4, 2.2, 14), 'backboard', None), ('lockBar', 'cabinet', 'box', (25.5, 108.6, 0.5), (55.4, 3.2, 7), 'cabinet', None),
    ('apron', 'cabinet', 'box', (23.3, 105.6, 3.1), (46.6, 4, 0.3), 'apron', None),
    ('wheel', None, 'box', (44.5, 5.5, 0), (0.8, 0.8, 0.9), 'parts', 'art/wheel.obj'), ('booth', None, 'box', (5.5, 104.6, 3.25), (1, 1, 1), 'parts', 'art/booth.obj'),
    ('bigTop', None, 'cylinder', (6, 5.5, 0), (8, 8, 7), 'tent', None),
]


def lights_and_models():
    s = Session('Twilight Fair, 3: the lights and the scenery. A string of bulbs under the arch, a light for each lane and each\n'
                'shot, the lamps of the general illumination; then the cabinet, the big wheel, the big top and the ticket booth.')
    for i in range(7):   # the bulbs: on an arc of 21.5 cm round the middle of the arch
        a = math.radians(200 + i * 140 / 6)
        light(s, 'round-light', f'bulb{i + 1}', 'bulbs', 25.5 + math.cos(a) * 21.5, 27 + math.sin(a) * 21.5, WARM[i % 3], 5, size=0.6)
    for i, x in enumerate((16.25, 23.75, 31.25)):
        light(s, 'round-light', f'laneLight{i + 1}', 'lanes', x, 22.5, '#ffcf5a', 3)
    light(s, 'round-light', 'gi1', 'general', 11.2, 78.5, '#fff0c8', 8, size=0.5)
    light(s, 'round-light', 'gi2', 'general', 36.5, 78.5, '#fff0c8', 8, size=0.5)
    light(s, 'round-light', 'carouselLight', 'shots', 23.85, 43.5, '#ffcf5a', 6, size=1.4)
    light(s, 'arrow-light', 'strikerLight', 'shots', 13, 35, '#ff8a4a', 4, angle=-135)
    light(s, 'arrow-light', 'coconutLight', 'shots', 41.5, 64, '#ffb060', 4, angle=0)
    light(s, 'arrow-light', 'duckLight', 'shots', 6.5, 59, '#7fd8ff', 4, angle=180)
    light(s, 'round-light', 'shootAgain', None, 23.85, 100, '#ff5a4a', 4, size=1.3)
    s.note('The lights that go with things: each lane switch lights its own, the striker its arrow.')
    for i in range(3):
        s.goto(f'lane{i + 1}')
        s.choose('light', f'laneLight{i + 1}')
    s.goto('striker')
    s.choose('light', 'strikerLight')
    s.goto('lighting')
    s.choose('general', 'general')
    s.color('background', '#0b0612')
    s.color('ambient', '#6a5c60')
    s.goto('lighting.lamps[0]')
    s.color('color', '#ffe8d0')
    s.goto('lighting.lamps[1]')
    s.color('color', '#6a3a5a')
    s.note('The scenery: boxes for the cabinet, mesh files of the folder for the wheel and the booth, a cone for the big top.')
    for name, group, entry, at, scale, look, mesh in MODELS:
        s.place(entry, [(20, 50)])
        named(s, name, group)
        s.set('at', *at)
        s.set('scale', *scale)
        s.choose('look', look)
        if mesh:
            s.choose('mesh', mesh)
    s.goto('bigTop')
    s.choose_line('shape', 3)
    s.save()
    return s


TESTS = ['counter', 'lights', 'targets', 'mode', 'rank', 'mission', 'balls']
DO = ['score', 'bonus', 'multiplier', 'light', 'count', 'reset', 'say', 'sound', 'award', 'rotate']
WAYS = ['on', 'off', 'blink', 'flash', 'toggle']


def rule(s, on, event, actions, conditions=()):
    """A rule made in its form, by choices: where the event comes from and the event, what must hold, what it does. A new
    rule does one thing (100 points), which becomes the first thing this one does; the others are added. A condition or
    an action is added by its kind, in the list the button Add opens, and is whole at once: the editor gives it what the
    table has (the first group of lights, the first bank of drop targets, the first sound), and each part is then chosen
    in a list (a name, typed in the box of a long list to find it), or typed when it is a number or a text for the panel."""
    s.goto('+rule')
    s.choose('on', on)
    s.choose('event', event)
    for k, (test, parts) in enumerate(conditions):
        s.add_kind('if', TESTS.index(test))
        if 'target' in parts:
            s.choose(f'if[{k}].target', parts['target'])
    for k, (do, parts) in enumerate(actions):
        if k > 0:
            s.add_kind('do', DO.index(do))
        elif do != 'score':
            s.choose_line('do[0].do', DO.index(do))
        if 'target' in parts:
            s.choose(f'do[{k}].target', parts['target'])
        if 'line' in parts:   # in a list short enough to show whole (ten names at most): one of its lines, counted from 0
            s.choose_line(f'do[{k}].target', parts['line'])
        if 'way' in parts:
            s.choose_line(f'do[{k}].mode', WAYS.index(parts['way']))
        if 'text' in parts:
            s.set(f'do[{k}].target', parts['text'])
        for number in ('value', 'seconds'):
            if number in parts:
                s.set(f'do[{k}].{number}', parts[number])


def score(points):
    return ('score', {'value': points})


def lights(target, way, seconds=None):
    return ('light', {'target': target, 'way': way} if seconds is None else {'target': target, 'way': way, 'seconds': seconds})


def sound(name):
    return ('sound', {'target': name})


def say(text):
    return ('say', {'text': text})


RULES = [   # the first two are the starter table's: the bumpers (500) and the targets, now the ducks (1000)
    ('slings', 'hit', [score(110)]),
    ('bumpers', 'hit', [lights('bulbs', 'flash', 0.25)]),
    ('lanes', 'roll', [score(300), lights('self', 'on')]),
    ('flippers', 'flip', [('rotate', {'line': 1, 'value': 1})]),   # the table has four groups of lights: the lanes are the second
    ('coconuts', 'down', [score(2000)]),
    ('striker', 'capture', [score(5000), ('bonus', {'value': 500}), lights('bulbs', 'flash', 0.8)]),
    ('bells', 'hit', [score(2500), say('DING!')]),
    ('spinner', 'spin', [score(100)]),
    ('game', 'start', [sound('jingleStart'), lights('general', 'on'), say('ROLL UP, ROLL UP')]),
    ('game', 'ballStart', [lights('general', 'on')]),
    ('game', 'drain', [sound('drainWhistle')]),
    ('game', 'ballSaved', [sound('jingleSaved')]),
    ('game', 'bump', [sound('cabinetKnock')]),
    ('game', 'tilt', [sound('jingleTilt'), lights('general', 'off'), say('TILT')]),
    ('game', 'missionDone', [sound('jingleMission'), lights('bulbs', 'flash', 1.5)]),
    ('game', 'rankUp', [sound('jingleRank')]),
    ('game', 'extraBall', [sound('jingleExtra')]),
    ('game', 'jackpot', [sound('jingleJackpot')]),
    ('game', 'gameOver', [sound('jingleOver'), lights('general', 'off')]),
    ('game', 'letter', [sound('letterKey')]),
]
# The two rules with a condition: when every lane light is on, when every coconut is down. The condition is added by its kind and
# is whole at once (the editor gives "the targets of coconuts are all down" by itself: the coconuts are the table's bank of drop targets).
CONDITIONAL = [
    ('lanes', 'roll', [('lights', {'target': 'lanes'})], [('multiplier', {'value': 1}), ('bonus', {'value': 1000}), lights('lanes', 'off'), say('LANES LIT: BONUS X')]),
    ('coconuts', 'down', [('targets', {'target': 'coconuts'})], [score(10000), ('bonus', {'value': 2000}), ('reset', {'target': 'coconuts'}), say('COCONUT SHY CLEARED')]),
]
# A step is its event, chosen among the events, and a thing among those that send it. The editor gives a thing by itself: the
# first group that sends the event (the bumpers for a hit), the bank of drop targets for targets knocked down, the only kicker.
GIVEN = {'hit': 'bumpers', 'capture': 'striker', 'down': 'coconuts'}
MISSIONS = [   # name, award, what the panel asks for, where the event comes from, the event, how many times, the light that blinks
    ('Carousel Ride', 20000, 'Ride the carousel: hit the bumpers', 'bumpers', 'hit', 10, 'carouselLight'),
    ('Ring the Bell', 30000, 'Shoot the high striker', 'striker', 'capture', 2, 'strikerLight'),
    ('Coconut Shy', 30000, 'Knock down the coconuts', 'coconuts', 'down', 3, 'coconutLight'),
    ('Duck Pond', 25000, 'Hook the ducks', 'ducks', 'hit', 4, 'duckLight'),
]


def rules():
    s = Session('Twilight Fair, 4: how it is played. The rules, each made in its form by choices (what happens, where, what must\n'
                'hold and what it does); the missions and the ranks; the light of the ball save.')
    for on, event, actions in RULES:
        rule(s, on, event, actions)
    s.note('The two rules with a condition: "the lights of lanes are all on", "the targets of coconuts are all down".')
    for on, event, conditions, actions in CONDITIONAL:
        rule(s, on, event, actions, conditions)
    s.note('The missions: the starter table\'s becomes the first; the others are added, each with its step.')
    for i, (name, award, text, on, event, count, lamp) in enumerate(MISSIONS):
        s.goto('rules.missions[0]' if i == 0 else '+mission')
        s.set('name', name)
        s.set('award', award)
        s.goto(f'rules.missions[{i}].steps[0]')
        s.set('text', text)
        s.choose('event', event)
        if on != GIVEN[event]:
            s.choose('on', on)
        s.set('count', count)
        s.choose('light', lamp)
    s.goto('rules')
    s.lines_of('ranks', ['Visitor', 'Regular', 'Barker', 'Showman', 'Ringmaster'])
    s.goto('rules')
    s.choose('ballSaveLight', 'shootAgain')
    s.set('ballSave', 10)
    s.save()
    return s


ART = ['playfield.jpg', 'ball.jpg', 'flipper.png', 'cap.png', 'deck.jpg', 'backboard.jpg', 'apron.jpg', 'palette.png', 'tent.png', 'wheel.obj', 'booth.obj', 'backglass.jpg', 'backglass-wide.jpg']


def screen_and_credits():
    s = Session('Twilight Fair, 5: the screen and the credits. The picture and the colours of the score panel in both layouts;\n'
                'who made the files of the folder.')
    for layout, image in (('landscape', 'art/backglass.jpg'), ('portrait', 'art/backglass-wide.jpg')):
        s.goto(f'layouts.{layout}.panel')
        s.color('color', '#1c0e1c')
        s.choose('image', image)
        for item, color in ((0, '#ffcf5a'), (3, '#ff9a5a')):   # the title, the rank
            s.goto(f'layouts.{layout}.panel.items[{item}]')
            s.color('color', color)
    files = [[f'sounds/{name}.mp3' for name in sorted(['bumper'] + [row[1] for row in SOUNDS])], [f'art/{name}' for name in ART]]
    for (source, licence), names in zip((('tools/twilight_fair_sounds.py', 'original work, synthesised by the script; nothing sampled'),
                                         ('tools/twilight_fair_art.py', 'original work, drawn and modelled by the script; its text is set in Inter (SIL Open Font License 1.1)')), files):
        s.goto('+credit')
        s.set('author', 'the Zinc project')
        s.set('source', source)
        s.set('licence', licence)
        s.lines_of('files', names)
    s.save()
    return s


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'sessions')
    os.makedirs(out, exist_ok=True)
    for name, make in (('01-layout', layout), ('02-looks-and-sounds', looks_and_sounds), ('03-lights-and-models', lights_and_models), ('04-rules', rules),
                       ('05-screen-and-credits', screen_and_credits)):
        s = make()
        s.lines.append(f'# frames {s.frame + 6}')
        s.write(os.path.join(out, f'{name}.input'))
        print(f'{name}.input  {len(s.lines)} lines, {s.frame + 6} frames')


if __name__ == '__main__':
    main()
