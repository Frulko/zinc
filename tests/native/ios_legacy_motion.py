#!/usr/bin/env python3
"""Explicit real-device Retina Motion cadence check; resets rn-showcase and saves evidence."""
import argparse
import json
from pathlib import Path
import re
import statistics
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--modes', default='0,1')
for flag in ('cache', 'discard', 'occlude'): parser.add_argument('--'+flag, choices=('0','1'), default='1')
args = parser.parse_args()
modes = args.modes.split(',')
if not modes or any(m not in ('0', '1', '2') for m in modes):
    parser.error('modes must be a comma-separated list of 0,1,2')
args.output.mkdir(parents=True, exist_ok=True)
(args.output / 'settings.json').write_text(json.dumps({k:getattr(args,k) for k in ('modes','cache','discard','occlude')},indent=2)+'\n')
tool = Path(__file__).resolve().parents[2] / 'tools/ios-legacy-device'
def call(*words):
    return subprocess.check_output([str(tool), *map(str, words)], text=True)

try:
    call('stop'); call('start'); time.sleep(3)
    for flag in ('cache','discard','occlude'): call('gpu-'+flag, getattr(args,flag))
    call('tap', 280, 440); time.sleep(1)
    call('tap', 150, 405); time.sleep(2)
    call('drag', 310, 380, 310, 180, 1000); time.sleep(2)
    call('shot', args.output / 'before.png')
    for mode in modes:
        call('gpu-direct', mode)
        call('frame-time', 'on')
        for target in (200, 100):
            call('drag', 140, 260, target, 260, 3000); time.sleep(3.5)
        call('frame-time', 'off')
        log = call('logs')
        (args.output / f'direct-{mode}.log').write_text(log)
        # Logs accumulate: these are the last two gestures, excluding initial setup and 100 ms of startup.
        gestures = [tuple(map(int, m)) for m in re.findall(r'zinc gesture: at=(\d+) duration=(\d+)', log)][-2:]
        presentations = [tuple(map(int, m)) for m in re.findall(r'zinc presentation: at=(\d+) us=(\d+)', log)]
        results = []
        for start, duration in gestures:
            samples = sorted(us for at, us in presentations if start + 100000 < at < start + duration)
            if not samples:
                raise RuntimeError('no active-gesture presentation samples; verify device UI and instrumented build')
            results.append({'samples': len(samples), 'medianUs': statistics.median(samples), 'p95Us': samples[int((len(samples)-1)*0.95)], 'maxUs': max(samples), 'over20ms': sum(v > 20000 for v in samples)})
        (args.output / f'direct-{mode}.json').write_text(json.dumps(results, indent=2)+'\n')
        print(mode, json.dumps(results))
    call('shot', args.output / 'after.png')
finally:
    call('frame-time', 'off'); call('gpu-batch', 'off'); call('gpu-time', 'off'); call('gpu-direct', '2'); call('up'); call('stop')
