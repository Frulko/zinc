"""A typist for the table editor: writes what a person does in examples/pinball3d-editor (pointer, keys, typed text) as a
scripted session, one event per line, for a window of 1440 x 900 (ZINC_INPUT). The table "Twilight Fair" was made by the
sessions sessions.py writes with it: no line of its table.json was typed in a file.

Everything is reached as a person reaches it, and as the editor's own tests do: a thing by its name or an entry of the
palette by its key in the box "Go to" (Cmd+G), a field of the selection by its key in the box "Find a field" (Cmd+F), which
leaves that field alone at the top of the form; a place by a click on the top view. Nothing depends on where a line of a
form is, except the lines of a short list that opens under a field (a list of more than ten has a box to type in)."""
import re

# the top view of a board of 51 x 107 cm in a window of 1440 x 900, while the pane beside it shows the heights
ZOOM, LEFT, TOP = 6.6, 501.4, 122.6
# the control of the field that "Find a field" left alone at the top of the form, and the lines of the list it opens
FIELD_X, FIELD_Y, LINE = 1300, 112, 24
FIRST_LINE, FIRST_AFTER_BOX = 144, 176
SWATCH_X = 1248
# the button "Add" of a list of sentences (the conditions, the actions of a rule) that "Find a field" left alone at the top of the
# form, and the first line of the list of kinds it opens
ADD_X, ADD_Y, ADD_FIRST_LINE = 1394, 118, 150


def number(v):
    return str(int(v)) if float(v) == int(v) else repr(round(float(v), 4))


class Session:
    def __init__(self, title):
        self.frame = 4
        self.lines = [f'# {line}' for line in title.split('\n')]

    def note(self, text):
        self.lines += [f'# {line}' for line in text.split('\n')]

    def ev(self, what):
        self.lines.append(f'{self.frame} {what}')
        self.frame += 1

    def rest(self, frames=1):
        self.frame += frames

    def key(self, name, mods=''):
        self.ev(f'key {name} {mods}'.strip())

    def text(self, t):
        t = str(t)
        self.ev('text ' + (t if re.fullmatch(r'[^\s"\\]+', t) else '"' + t.replace('\\', '\\\\').replace('"', '\\"') + '"'))

    def click(self, x, y):
        self.ev(f'move {round(x)} {round(y)}')
        self.ev('down')
        self.ev('up')
        self.rest()

    def at(self, x, y):
        """A click on the top view at a place of the table, in centimetres."""
        self.click(LEFT + x * ZOOM, TOP + y * ZOOM)

    def drag(self, x0, y0, x1, y1):
        """A press at one place of the table, let go at another."""
        ax, ay, bx, by = LEFT + x0 * ZOOM, TOP + y0 * ZOOM, LEFT + x1 * ZOOM, TOP + y1 * ZOOM
        self.ev(f'move {round(ax)} {round(ay)}')
        self.ev('down')
        self.ev(f'move {round((ax + bx) / 2)} {round((ay + by) / 2)}')
        self.ev(f'move {round(bx)} {round(by)}')
        self.ev('up')
        self.rest()

    def away(self):
        """A click beside the board: it leaves the field being typed in, and selects nothing."""
        self.click(420, 500)

    # ---- things
    def goto(self, name):
        """A thing by its name or its path, or with "+", an entry of the palette or a new item of a list."""
        self.key('g', 'meta')
        self.text(name)
        self.key('Enter')
        self.rest()

    def place(self, entry, points, path=False):
        """An entry of the palette placed by clicks: one per point; a path ends with Enter."""
        self.goto('+' + entry)
        for p in points:
            self.at(p[0], p[1])
        if path:
            self.key('Enter')
            self.rest()

    # ---- fields of the selection
    def find(self, field):
        self.key('f', 'meta')
        self.text(field)
        self.rest()

    def set(self, field, *values):
        """Types a text or a number in a field; several values fill the boxes of a row of numbers."""
        self.find(field)
        for v in values:
            self.key('Tab')
            self.text(v if isinstance(v, str) else number(v))
        self.key('Enter')
        self.rest()

    def lines_of(self, field, lines):
        """A field that takes one text per line: each line typed, then a click beside the board leaves the field."""
        self.find(field)
        self.key('Tab')
        self.key('a', 'meta')
        for i, line in enumerate(lines):
            if i > 0:
                self.key('Enter')
            self.text(line)
        self.away()

    def choose(self, field, typed):
        """Opens the list of a field and takes the first line that holds what is typed (a list with a box to type in)."""
        self.find(field)
        self.click(FIELD_X, FIELD_Y)
        self.text(typed)
        self.key('Enter')
        self.rest()

    def choose_line(self, field, line, typed=None):
        """Opens the list of a field and clicks one of its lines, counted from 0; `typed`: in a list with a box to type
        in, what is typed first, the line then being counted among those that are left."""
        self.find(field)
        self.click(FIELD_X, FIELD_Y)
        if typed is not None:
            self.text(typed)
            self.rest()
        self.click(FIELD_X, (FIRST_LINE if typed is None else FIRST_AFTER_BOX) + LINE * line)

    def add_kind(self, field, line):
        """In a list whose items are sentences (the conditions and the actions of a rule): its button Add, then one line
        of the list of kinds it opens, counted from 0. The new item is whole at once: its parts are then choices."""
        self.find(field)
        self.click(ADD_X, ADD_Y)
        self.click(FIELD_X, ADD_FIRST_LINE + LINE * line)

    def segment(self, field, index, count):
        """One of the two or three words shown side by side for a field."""
        self.find(field)
        self.click(1236 + 2 + (index + 0.5) * 156 / count, FIELD_Y)

    def switch(self, field):
        """A yes / no field, turned over."""
        self.find(field)
        self.click(1252, FIELD_Y)

    def color(self, field, value):
        """A colour typed in the box beside its swatch."""
        self.set(field, value)

    def save(self):
        self.away()
        self.key('s', 'meta')
        self.rest(3)

    def write(self, path):
        with open(path, 'w') as f:
            f.write('\n'.join(self.lines) + '\n')
        return self.frame + 4
