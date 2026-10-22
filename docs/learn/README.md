# Learn Zinc: from a shape to an app

These lessons show how to make a program that puts something on the screen, answers the keyboard, the mouse and touch,
draws, plays sound, and then how to build an interface with text and buttons. Each lesson is short. Each one gives the
whole code, explains it line by line, and ends with changes to try.

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

The code of every lesson is a small project in [`docs/learn/samples/`](samples/): a `zinc.json` file and a `src` folder.
Download that folder from [GitHub](https://github.com/Frulko/zinc/tree/main/docs/learn/samples), or use your copy of the
Zinc repository.

**In a terminal**, give `zinc run` the lesson's folder:

```sh
zinc run docs/learn/samples/01-window-and-shape
```

A window opens. Close it to stop the program. What the program prints with `console.log` shows in the terminal.

**In Zinc Atelier**, choose *File > Open Sketch…* (Cmd+O on a Mac, Ctrl+O elsewhere), pick the lesson's folder, then
*Sketch > Run* (Cmd+R or Ctrl+R). The printed lines show in Atelier's console. Change the code and run it again.

**Your own project**: make a folder with the two files of the lesson. `zinc.json` says where the code is and how big the
window is; lesson 1 explains it. Then `zinc run` in that folder.

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

Each lesson takes 10 to 20 minutes. Do them in order: each one uses what the one before taught.

## Two ways to put things on screen

| | `zinc:gfx` (part 1) | `zinc:ui` (part 2) |
|---|---|---|
| You write | what to draw, every frame | what the screen holds, once |
| Good for | games, animations, art, visualisations | apps, forms, tools, settings |
| Position | you give every x and y | the layout places the elements |
| Changes | you draw the new picture | you change a value, the screen follows |

They mix: lesson 11 draws with `zinc:gfx` inside an interface.

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

## When you know these

- [zinc:gfx reference](../reference/gfx.md): every drawing and input function, grouped.
- [zinc:ui events](../reference/ui-events.md): every event of the interface, what it gives you, when it fires.
- [zinc:stage reference](../reference/stage.md): a scene of objects as ActionScript 3 and Haxe write it, light enough for old tablets.
- [UI apps](../guide/03-ui-apps.md) and [zinc:ui in depth](../ui.md): scrolling, text fields, animations, layers.
- [The UI kit](../ui-kit.md): ready-made buttons, dialogs, menus and tabs.
- [Sound](../plugins/audio.md): every function of `zinc:audio`.
- The examples of Zinc Atelier (*File > Examples…*) and `zinc new game-2d`, a small complete game to read and change.
