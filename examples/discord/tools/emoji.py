#!/usr/bin/env python3
# Writes assets/emoji.txt, the emoji picker's list, from Unicode's emoji-test.txt (https://unicode.org/Public/emoji/15.1/emoji-test.txt,
# Unicode License v3: https://www.unicode.org/license.txt): the fully-qualified emoji without skin tones, in CLDR order, under their groups ("@ group").
#   python3 tools/emoji.py emoji-test.txt > assets/emoji.txt
# 15.1, not newer: the emoji the colour fonts of the systems in use draw (macOS 14.4 and later, Noto Color Emoji 2023).
import sys

TONES = {0x1F3FB, 0x1F3FC, 0x1F3FD, 0x1F3FE, 0x1F3FF}
print('# Unicode emoji-test.txt 15.1 (Unicode License v3, https://www.unicode.org/license.txt), written by tools/emoji.py')
for line in open(sys.argv[1], encoding='utf-8'):
    if line.startswith('# group: '):
        group = line[9:].strip()
        if group != 'Component':
            print('@', group)
        continue
    if '; fully-qualified' not in line or line.startswith('#'):
        continue
    codes = [int(c, 16) for c in line.split(';')[0].split()]
    if any(c in TONES for c in codes):
        continue
    name = line.split('#', 1)[1].strip().split(' ', 2)[2]   # "😀 E1.0 grinning face"
    print(''.join(chr(c) for c in codes), name)
