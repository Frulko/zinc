#!/usr/bin/env python3
"""Render a mapper setup and encode a silent, pre-mapped video."""
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import signal
import struct
import subprocess
import sys
import tempfile


class BakeCancelled(RuntimeError):
    pass


def cancel_bake(signum, frame):
    raise BakeCancelled('export cancelled; temporary files removed')


def prepare_column(mapping_path, show_path, column, temporary):
    try:
        setup = json.loads(mapping_path.read_text())
        show = json.loads(show_path.read_text())
        layers, columns = setup['layers'], show['columns']
        if not isinstance(layers, list) or not isinstance(columns, list) or not 0 <= column < len(columns):
            raise ValueError('column is outside the show')
        cells = columns[column]['cells']
        if not isinstance(cells, list):
            raise ValueError('column cells must be a list')
        for index, layer in enumerate(layers):
            if not isinstance(layer, dict):
                raise ValueError('mapping layer must be an object')
            clip = cells[index] if index < len(cells) else None
            if clip is not None and not isinstance(clip, dict):
                raise ValueError('clip must be an object or null')
            clip = clip or {}
            media = clip.get('media', '') if isinstance(clip.get('media', ''), str) else ''
            source = clip.get('source', '') if isinstance(clip.get('source', ''), str) else ''
            if not media and not source:
                layer['media'], layer['source'] = [''], ['none']
                continue
            fit = clip.get('fit')
            if isinstance(fit, str):
                if fit not in ('stretch', 'contain', 'cover', 'width', 'height'):
                    raise ValueError(f'unsupported fit: {fit}')
                layer['fit'] = [fit]
            for key, default in (('frame', [0, 0, 1]), ('picture', [0, 0, 0, 1])):
                values = clip.get(key, default)
                if not isinstance(values, list) or len(values) != len(default) or any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
                    raise ValueError(f'invalid clip {key}')
                layer[key] = values
            if isinstance(clip.get('loop'), bool):
                layer['loop'] = [int(clip['loop'])]
            if media:
                layer['media'], layer['source'] = [media], ['image']
            else:
                if source not in ('pattern', 'solid', 'gradient', 'none'):
                    raise ValueError(f'unsupported clip source: {source}')
                layer['media'], layer['source'] = [''], [source]
                if 'color' in clip and clip['color'] != []:
                    values = clip['color']
                    if not isinstance(values, list) or len(values) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
                        raise ValueError('invalid clip color')
                    layer['color'] = values
        selected = temporary / 'mapping.json'
        selected.write_text(json.dumps(setup))
        return selected
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        raise RuntimeError(f'cannot prepare cue: {error}') from error


def check_frame(frame, width, height):
    if not frame.is_file() or frame.stat().st_size == 0:
        raise RuntimeError('Zinc did not produce an image; check that GL output is available')
    with frame.open('rb') as captured:
        header = captured.read(26)
    if len(header) != 26 or header[:2] != b'BM' or struct.unpack('<ii', header[18:26]) != (width, height):
        raise RuntimeError(f'GL capture does not match {width}x{height}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mapping', type=Path, help='saved mapping.json (current static layer state)')
    parser.add_argument('output', type=Path, help='new MP4 file; existing files are never overwritten')
    parser.add_argument('--show', type=Path, help='saved show.json; use with --column')
    parser.add_argument('--column', type=int, help='zero-based cue column to bake')
    parser.add_argument('--media', type=Path, help='media directory (default: media beside mapping.json)')
    parser.add_argument('--duration', type=float, default=5, help='duration in seconds, 0 < duration <= 3600')
    parser.add_argument('--size', default='1280x720', help='physical output resolution (even width x height, max 4096)')
    parser.add_argument('--fps', type=int, default=30, help='frames per second, 1–60')
    parser.add_argument('--zinc', default='zinc', help='path to the Zinc executable')
    parser.add_argument('--animated', action='store_true', help='bake up to four video layers from time zero, without audio')
    parser.add_argument('--ffprobe', default='ffprobe', help='path to FFprobe (animated export)')
    parser.add_argument('--ffmpeg', default='ffmpeg', help='path to the FFmpeg executable')
    options = parser.parse_args()
    if not 0 < options.duration <= 3600 or not 1 <= options.fps <= 60:
        parser.error('duration must be in (0, 3600] and fps in [1, 60]')
    try:
        width_text, height_text = options.size.lower().split('x')
        width, height = int(width_text), int(height_text)
    except ValueError:
        parser.error('size must be WIDTHxHEIGHT')
    if not (2 <= width <= 4096 and 2 <= height <= 4096 and width % 2 == 0 and height % 2 == 0):
        parser.error('size must use even dimensions from 2 to 4096')
    if (options.show is None) != (options.column is None):
        parser.error('--show and --column must be supplied together')
    mapping = options.mapping.resolve()
    media = (options.media or mapping.parent / 'media').resolve()
    output = options.output.absolute()
    if not mapping.is_file():
        parser.error(f'mapping not found: {mapping}')
    if output.suffix.lower() != '.mp4' or not output.parent.is_dir():
        parser.error('output must be an MP4 in an existing directory')
    if output.exists() or output.is_symlink():
        parser.error(f'output already exists: {output}')
    for executable in (options.zinc, options.ffmpeg, options.ffprobe) if options.animated else (options.zinc, options.ffmpeg):
        if not shutil.which(executable):
            parser.error(f'executable not found: {executable}')
    project = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix='.mapper-bake-', dir=output.parent) as temporary:
        if options.show is not None:
            mapping = prepare_column(mapping, options.show, options.column, Path(temporary))
        frame = Path(temporary) / 'frame.bmp'
        video = Path(temporary) / 'output.mp4'
        env = os.environ.copy()
        for key in ('ZINC_HEADLESS', 'ZINC_SHOT_EVERY', 'ZINC_SHOT_FRAMES', 'ZINC_REALTIME', 'ZINC_RECORD', 'ZINC_REPLAY'):
            env.pop(key, None)
        env.update(ZINC_SCALE='1', ZINC_SIZE=f'{width}x{height}', ZINC_BACKGROUND='1', ZINC_DISPLAY='gl', ZINC_DETERMINISTIC='1', ZINC_FRAMES='3', ZINC_SHOT=str(frame), ZINC_NATIVE='real')
        # The GL compositor draws into an offscreen target when ZINC_SHOT is set.
        render_args = [options.zinc, 'run', str(project), '--', '--mapping', str(mapping), '--media', str(media)]
        if options.animated:
            count_float = options.duration * options.fps
            count = round(count_float)
            if not math.isclose(count_float, count, abs_tol=1e-6) or not 1 <= count <= 120:
                raise RuntimeError('animated duration × fps must be an integer from 1 to 120 frames')
            try:
                setup = json.loads(mapping.read_text())
                layers = setup['layers']
                videos = [(i, l['media'][0]) for i, l in enumerate(layers)
                          if isinstance(l, dict) and isinstance(l.get('media'), list) and l['media']
                          and isinstance(l['media'][0], str)
                          and Path(l['media'][0]).suffix.lower() in ('.mp4', '.mov', '.mkv', '.m4v', '.avi', '.webm', '.h264', '.mpg', '.ts')]
            except (OSError, ValueError, KeyError, TypeError) as error:
                raise RuntimeError(f'invalid mapping: {error}') from error
            if not 1 <= len(videos) <= 4:
                raise RuntimeError('animated export currently requires one to four video layers')
            if width > 1920 or height > 1080:
                raise RuntimeError('animated output must be at most 1920x1080')
            decoded = Path(temporary) / 'decoded'
            rendered = Path(temporary) / 'rendered'
            decoded.mkdir()
            rendered.mkdir()
            inputs = []
            required_per_frame = width * height * 4 + 1048576
            for index, name in videos:
                if not name.isascii() or not name or name.startswith('.') or '..' in name or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._' for c in name):
                    raise RuntimeError(f'unsafe media name: {name}')
                source = media / name
                if not source.is_file():
                    raise RuntimeError(f'missing video: {name}')
                probe = subprocess.run([options.ffprobe, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                        '-of', 'json', str(source)], capture_output=True, text=True, check=True, timeout=30)
                try:
                    stream = json.loads(probe.stdout)['streams'][0]
                    source_w, source_h = int(stream['width']), int(stream['height'])
                except (ValueError, KeyError, IndexError, TypeError) as error:
                    raise RuntimeError(f'video has no readable dimensions: {name}') from error
                if not 1 <= source_w <= 1920 or not 1 <= source_h <= 1080:
                    raise RuntimeError(f'video exceeds 1920x1080: {name}')
                required_per_frame += source_w * source_h * 4
                inputs.append((index, name, source))
            required = count * required_per_frame + 268435456
            if shutil.disk_usage(temporary).free < required:
                raise RuntimeError('not enough free space for decoded and mapped frames')
            for index, name, source in inputs:
                sequence = decoded / str(index)
                sequence.mkdir()
                subprocess.run([options.ffmpeg, '-v', 'error', '-nostdin', '-n', '-i', str(source), '-an',
                                '-vf', f'fps={options.fps}:start_time=0', '-frames:v', str(count), '-threads', '2',
                                '-start_number', '1', str(sequence / 'frame-%d.png')], check=True, timeout=120)
                if any(not (sequence / f'frame-{i}.png').is_file() for i in range(1, count + 1)):
                    raise RuntimeError(f'video is shorter than the requested duration: {name}')
            env['ZINC_FRAMES'] = '1'
            render_args.extend(['--frames', str(decoded), '--video-layers', ','.join(str(index) for index, _, _ in inputs), '--count', str(count), '--start', '1'])
            for i in range(1, count + 1):
                frame = rendered / f'frame-{i}.bmp'
                env['ZINC_SHOT'] = str(frame)
                render_args[-1] = str(i)
                result = subprocess.run(render_args, env=env, timeout=60, capture_output=True, text=True)
                if result.returncode:
                    raise RuntimeError(f'render frame {i} failed: {result.stderr[-2000:]}')
                check_frame(frame, width, height)
                print(f'Frame {i}/{count}', file=sys.stderr)
            subprocess.run([options.ffmpeg, '-v', 'error', '-nostdin', '-n', '-framerate', str(options.fps),
                            '-start_number', '1', '-i', str(rendered / 'frame-%d.bmp'), '-frames:v', str(count),
                            '-an', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', str(video)], check=True, timeout=120)
        else:
            subprocess.run(render_args, env=env, check=True, timeout=60)
            check_frame(frame, width, height)
            subprocess.run([options.ffmpeg, '-v', 'error', '-nostdin', '-n', '-loop', '1', '-framerate', str(options.fps),
                            '-i', str(frame), '-t', str(options.duration), '-an', '-c:v', 'libx264', '-threads', '2',
                            '-pix_fmt', 'yuv420p', str(video)], check=True, timeout=max(60, options.duration * 5))
        # link() publishes only if the destination still does not exist.
        # Publication is the finish line: cancellation cannot remove a completed file.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        os.link(video, output)
    print(f'Wrote {output} (silent {"animated" if options.animated else "static"} output, mapping already applied; do not map again).')


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, cancel_bake)
    try:
        main()
    except BakeCancelled as error:
        print(f'mapper bake: {error}', file=sys.stderr)
        sys.exit(130)
    except (OSError, RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(f'mapper bake: {error}', file=sys.stderr)
        sys.exit(1)
