# Learn Zinc: from a shape to an app

These lessons show how to make a program that puts something on the screen, answers the keyboard, the mouse and touch,
draws, plays sound, and then how to build an interface with text and buttons, a scene of objects, or a drawing with the canvas
of the web. Each lesson is short. Each one gives the whole code, explains it line by line, and ends with changes to try.

You do not need to know Zinc. A little JavaScript helps, but it is not required: every line is explained. Zinc programs
are written in TypeScript (JavaScript with types) with a few extra rules, so most of what you learn here also works on the
web.

## Before you start

Install Zinc with one command (more ways in [Getting started](../guide/01-getting-started.md#install)):

```sh
brew install frulko/zinc/zinc
zinc doctor
```

Or install **Zinc Atelier**, the app that edits and runs programs with no terminal (`--atelier` in the install command of
[Getting started](../guide/01-getting-started.md#install)).

## How to run a lesson

The code of every lesson is a small project (a `zinc.json` file and a `src` folder) that comes with Zinc: `zinc examples`
lists them with the other examples, graded by stars, and `zinc new my-lesson --from example:01-window-and-shape` copies one to change.

**In a terminal**, give `zinc run` the lesson's name (or its folder):

```sh
zinc run example:01-window-and-shape
```

A window opens. Close it to stop the program. What the program prints with `console.log` shows in the terminal.

**In Zinc Atelier**, choose *File > Open Sketch…* (Cmd+O on a Mac, Ctrl+O elsewhere), pick the lesson's folder, then
*Sketch > Run* (Cmd+R or Ctrl+R). The printed lines show in Atelier's console. Change the code and run it again.

**Your own project**: make a folder with the two files of the lesson. `zinc.json` says where the code is and how big the
window is; lesson 1 explains it. Then `zinc run` in that folder.

## Learn by doing: `zinc learn`

The first five lessons are also exercises, with no download and no network: each has a few steps, each step says what to change,
checks your code when you save, and gives a hint or the solution when you ask.

```sh
zinc learn          # the lessons and how far you went
zinc learn 1        # lesson 1 in a new folder: edit src/main.ts, save, the step is checked
```

While it watches, Enter checks again, `h` prints a hint, `s` the solution and `q` stops; `zinc learn` goes on where you stopped. In
**Zinc Atelier**, *Help > Lessons* opens the same lesson in a panel beside the code, with Check, Hint and Solution buttons; both keep
the same progress.

## The lessons

**Part 1: drawing.** Your program draws the whole picture itself, again and again, many times a second. This is how games,
animations and generative art work. It uses the module `zinc:gfx`.

1. [A window and a shape](01-window-and-shape.md): open a window, paint the background, draw a rectangle and a circle.
2. [Colours and movement](02-colours-and-movement.md): the frame loop, time between frames, colours made from numbers.
3. [The keyboard](03-keyboard.md): move a square with the arrow keys, read the name of any key.
4. [The mouse and touch](04-mouse-and-touch.md): draw lines with the mouse or a finger, the wheel, the right button.
5. [Text and images](05-text-and-images.md): fonts and sizes, centred text, a picture from the assets folder.
6. [Sound](06-sound.md): play notes when you click or press a key.

**Part 2: an interface.** You describe the screen once, as elements in a tree (a box holds a title and a button), and Zinc
draws it and keeps it up to date. This is how apps and tools work. It uses `zinc:ui`, written like React or Solid.

7. [Components](07-components.md): `View`, `Text`, `Image`, `Button`, and how they are laid out.
8. [State](08-state.md): a value the screen follows by itself (a signal).
9. [Events](09-events.md): clicks, pointer presses and moves, the keyboard.
10. [Styles](10-styles.md): colours, sizes, spacing and corners with `className`, styles that change.
11. [A drawing inside an interface](11-drawing-in-an-interface.md): a `Canvas` that draws with `zinc:gfx` next to buttons.
12. [A small complete app](12-a-small-app.md): a shopping list where you type, add, tick and clear.

**Part 3: a scene.** Your program is made of objects, each one a class that knows its place, draws itself and answers taps and
drags; a stage holds them and draws only when something changed. This is how ActionScript 3 (Flash) and Haxe write games and apps,
and how Zinc's apps stay fast on old tablets. It uses `zinc:stage`.

13. [A stage and a sprite](13-a-stage-and-a-sprite.md): a class of ball, three balls on a stage, `onUpdate` and `onDraw`.
14. [Children and local coordinates](14-children-and-local-coordinates.md): a moon around a planet around the sun.
15. [Taps and drags](15-taps-and-drags.md): a button that counts its taps, cards you pick up and move.
16. [The layout and a scroll box](16-layout-and-scrolling.md): a title bar in a row, a list of fruits that scrolls.

**Part 4: the canvas of the web.** The drawing of part 1, with the calls web pages use to draw in a `<canvas>`: paths, outlines,
curves, transforms and gradients. Code from a web page or a canvas tutorial reads the same way. It uses `zinc:canvas`.

17. [Paths and fills](17-paths-and-fills.md): a house with a roof, a door, a window and a curved path.
18. [Transforms](18-transforms.md): two clocks drawn by moving, turning and shrinking the paper.
19. [An animation](19-animation.md): a windmill whose blades turn and clouds that drift.
20. [Text and gradients](20-text-and-gradients.md): a poster with a fading sky, a glowing sun and centred text.

Each lesson takes 10 to 20 minutes. Do the lessons of a part in order: each one uses what the one before taught. Parts 2, 3
and 4 each start from part 1, so after part 1 take the one you like.

## Four ways to put things on screen

| | `zinc:gfx` (part 1) | `zinc:ui` (part 2) | `zinc:stage` (part 3) | `zinc:canvas` (part 4) |
|---|---|---|---|---|
| You write | what to draw, every frame | what the screen holds, once | objects that draw themselves | what to draw, every frame, as on the web |
| Good for | games, animations, art | apps, forms, tools, settings | apps and games on old tablets | web canvas code, vector drawings |
| Position | you give every x and y | the layout places the elements | each object in its parent, or a row or column | you give every x and y, or move the paper |
| Changes | you draw the new picture | you change a value, the screen follows | you move an object, the stage draws | you draw the new picture |

They mix: lesson 11 draws with `zinc:gfx` inside an interface. [Four ways to write a program](../start/styles.md) shows the same
small program written in each, side by side, and how they go together. [Beyond the components](../start/beyond.md) puts a scene
inside an interface and an interface inside a scene, and goes past the ready-made elements: charts, styles as objects, components of
your own, animations.

## Words you will meet

| Word | Meaning |
|---|---|
| pixel | one dot of the screen. Sizes and positions are counted in pixels. |
| x, y | a position: x counts pixels from the left edge, y from the top edge. (0, 0) is the top left corner. |
| frame | one picture of the window. A program shows about 60 frames a second, like a flip book. |
| function | a named piece of code that runs when you call it: `clear(0xffffff)` calls `clear`. |
| callback | a function you give to Zinc, which calls it later: on each frame, on a click. |
| module | a set of functions you can import: `zinc:gfx` draws, `zinc:audio` plays sound, `zinc:ui` builds interfaces. |
| type | what kind of value a variable holds: `number`, `string` (text), `boolean` (true or false). Zinc checks them before running. |
| signal | a value that the interface follows: change it and every text or style that reads it changes too. |
| component | a piece of interface, written as a function that returns elements: `View`, `Text`, `Button`, or your own. |
| class | the plan of an object: what it holds (fields) and what it does (methods). `new Ball()` makes an object from the plan `Ball`. |
| sprite | an object of a scene (part 3): a position, a size, children, and the methods Zinc calls to update and draw it. |
| path | a shape the canvas builds point by point (part 4) before filling it or drawing its outline. |

## When you know these

- [zinc:gfx reference](../reference/gfx.md): every drawing and input function, grouped.
- [zinc:ui events](../reference/ui-events.md): every event of the interface, what it gives you, when it fires.
- [zinc:stage reference](../reference/stage.md): every class and function of part 3.
- [zinc:canvas](../plugins/canvas2d.md): every function of part 4, and the few differences from the web.
- [UI apps](../guide/03-ui-apps.md) and [zinc:ui in depth](../ui.md): scrolling, text fields, animations, layers.
- [The UI kit](../ui-kit.md): ready-made buttons, dialogs, menus and tabs.
- [Beyond the components](../start/beyond.md): what to do when the ready-made elements are not enough.
- [Sound](../plugins/audio.md): every function of `zinc:audio`.
- The examples of Zinc Atelier (*File > Examples…*) and `zinc new game-2d`, a small complete game to read and change;
  `zinc new stage` and `zinc new canvas` start a project in the style of part 3 or part 4.
