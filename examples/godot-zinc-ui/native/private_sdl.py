#!/usr/bin/env python3
"""Keep SDL implementation private when sharing a process with Godot's SDL."""
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
root = Path(__file__).resolve().parents[3]
build = Path(os.environ.get('BUILD', root / 'build')).resolve()
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
sdl = build / 'third_party/SDL3'
flags = (sdl / 'CMakeFiles/SDL3-static.dir/flags.make').read_text()
def flag(name):
    return shlex.split(re.search(r'^' + name + r' = (.*)$', flags, re.M)[1])
obj = out / 'SDL_mfijoystick.m.o'
# Objective-C names ignore linker visibility; rename just these two private classes.
subprocess.run(['/usr/bin/cc', *flag('OBJC_DEFINES'), *flag('OBJC_INCLUDES'), *flag('OBJC_FLAGS'),
                '-DSDL3_RumbleMotor=ZincWarehouse_RumbleMotor',
                '-DSDL3_RumbleContext=ZincWarehouse_RumbleContext',
                '-c', str(root / 'third_party/SDL3/src/joystick/apple/SDL_mfijoystick.m'), '-o', str(obj)], check=True)
archive = out / 'libSDL3.a'
shutil.copyfile(sdl / 'libSDL3.a', archive)
subprocess.run(['ar', '-r', str(archive), str(obj)], check=True)
libs = (build / 'zn_app.link').read_text().splitlines()
(out / 'zn_app.link').write_text('\n'.join(str(archive) if x.endswith('/libSDL3.a') else x for x in libs) + '\n')
