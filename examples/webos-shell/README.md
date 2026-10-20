# webos-shell

A launcher for Zinc programs on HP webOS 3 (HP TouchPad): a grid of icons, a tap starts the program.

Each program is installed as a webOS application (hidden from the system's own launcher) and started through the system's
application manager (`zinc:webos`), so it gets its own card and the tablet's home gesture brings the shell back.
`tools/webos-apps` builds the shell and the programs, installs them and writes the shell's list, `apps.txt`: one line a
program, `id <tab> title <tab> icon file`. On a desktop the shell runs with a sample list and starts nothing.
