#!/usr/bin/env python3
"""Opt-in public audio roundtrip on an isolated, already prepared Linux snd-aloop image."""
import argparse
from array import array
from enum import Enum, auto
import io
import math
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import wave


class Skip(Exception):
    pass


class ChildAlive(RuntimeError):
    pass


def card_identity(card, subdevice, proc=Path('/proc/asound'), sound=Path('/sys/class/sound'), dev=Path('/dev/snd')):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,31}', card) or subdevice not in range(8):
        raise Skip('use an explicit ALSA card ID and subdevice 0..7')
    matches = [p for p in proc.glob('card[0-9]*') if re.fullmatch(r'card[0-9]+', p.name)
               and (p / 'id').read_text().strip() == card]
    if len(matches) != 1:
        raise Skip('named snd-aloop card is unavailable or ambiguous')
    number = int(matches[0].name[4:])
    if (sound / ('card' + str(number)) / 'device/driver/module').resolve(strict=True).name != 'snd_aloop':
        raise Skip('named card is not driven by snd_aloop')
    # A private ALSA config cannot constrain a different miniaudio backend or an accessible physical PCM.
    for node in dev.glob('pcmC*D*p'):
        match = re.fullmatch(r'pcmC([0-9]+)D[0-9]+p', node.name)
        if match and int(match[1]) != number and os.access(node, os.W_OK):
            raise Skip('isolated image required: another playback PCM is accessible')
    for name in ('pcmC%dD0p' % number, 'pcmC%dD1c' % number):
        node = dev / name
        if not stat.S_ISCHR(node.stat().st_mode) or not os.access(node, os.R_OK | os.W_OK):
            raise Skip('delegated loopback PCM is inaccessible')
    return matches[0] / ('pcm1c/sub%d/status' % subdevice)


def alsa_config(card, subdevice):
    # No global alsa.conf include: it would restore miniaudio's dmix/hw fallback routes.
    return ('pcm.!default { type hw card "%s" device 0 subdevice %d }\n'
            'pcm.zinc_capture { type hw card "%s" device 1 subdevice %d }\n') % (card, subdevice, card, subdevice)


def child_env(config):
    env = dict(os.environ)
    for key in list(env):
        if key.startswith(('ZINC_AUDIO', 'ALSA_')) or key in (
                'ZINC_HEADLESS', 'ZINC_DETERMINISTIC', 'ZINC_RECORD', 'ZINC_REPLAY', 'ZINC_FRAMES',
                'ZINC_DURATION', 'ZINC_REALTIME', 'ZINC_PLATFORM', 'ZINC_PROFILE', 'ZINC_SIMULATE',
                'ZINC_NATIVE', 'ZINC_SHOT'):
            env.pop(key)
    env.update(ALSA_CONFIG_PATH=str(config), ZINC_NATIVE='real', ZINC_BACKGROUND='1')
    return env


class Phase(Enum):
    NEW = auto()
    RUNNING = auto()
    CLOSED = auto()
    RETAINED = auto()


class Child:
    def __init__(self):
        self.phase = Phase.NEW
        self.process = None
        self.output = bytearray()

    def transition(self, phase):
        allowed = {Phase.NEW: (Phase.RUNNING, Phase.CLOSED),
                   Phase.RUNNING: (Phase.CLOSED, Phase.RETAINED), Phase.CLOSED: (), Phase.RETAINED: ()}
        if phase not in allowed[self.phase]:
            raise RuntimeError('illegal audio child transition')
        self.phase = phase

    def start(self, argv, env, selector):
        mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            self.process = subprocess.Popen(argv, env=env, stdout=subprocess.PIPE,
                                            stderr=subprocess.STDOUT, start_new_session=True)
            self.transition(Phase.RUNNING)
            selector.register(self.process.stdout, selectors.EVENT_READ, self)
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, mask)

    def close(self):
        if self.phase in (Phase.CLOSED, Phase.RETAINED):
            return
        if self.phase == Phase.NEW:
            self.transition(Phase.CLOSED)
            return
        try:
            if self.process.poll() is None:
                try:
                    os.killpg(self.process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired as e:
            self.transition(Phase.RETAINED)
            raise ChildAlive('unreaped audio child PID %d; retain its evidence directory' % self.process.pid) from e
        else:
            self.transition(Phase.CLOSED)
        finally:
            self.process.stdout.close()


def drain(selector, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise RuntimeError('audio loopback deadline exceeded')
    for key, _ in selector.select(min(remaining, 0.05)):
        data = os.read(key.fileobj.fileno(), 4096)
        if not data:
            selector.unregister(key.fileobj)
        else:
            child = key.data
            child.output.extend(data)
            if len(child.output) > 65536:
                raise RuntimeError('audio child output exceeded 64 KiB')


def capture_ready(text, pid):
    owner = re.search(r'^owner_pid\s*:\s*([0-9]+)\s*$', text, re.MULTILINE)
    return (re.search(r'^state:\s+(RUNNING|PREPARED)\s*$', text, re.MULTILINE) is not None
            and owner is not None and int(owner[1]) == pid)


def check_capture(path):
    if path.stat().st_size > 2_000_000:
        raise RuntimeError('capture exceeded 2 MB')
    with wave.open(str(path), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (2, 2, 48000, 'NONE'):
            raise RuntimeError('capture must be PCM16 stereo at 48 kHz')
        frames = wav.getnframes()
        if not 96000 <= frames <= 336000:
            raise RuntimeError('capture must contain 2..7 seconds')
        raw = wav.readframes(frames)
        if len(raw) != frames * 4:
            raise RuntimeError('truncated PCM capture')
    samples = array('h', raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    if any(abs(x) >= 32112 for x in samples):
        raise RuntimeError('clipped capture')
    # Correlation in 100 ms windows rejects silence/noise/other tones, on both channels.
    size = 4800
    bases = [[(math.cos(2 * math.pi * hz * i / 48000), math.sin(2 * math.pi * hz * i / 48000))
              for i in range(size)] for hz in (997, 1499)]
    found = [[], []]
    for start in range(0, frames - size + 1, size // 2):
        powers = []
        for channel in range(2):
            values = samples[2 * start + channel:2 * (start + size):2]
            power = sum(x * x for x in values)
            powers.append(power)
            if not (0.02 ** 2 <= power / size / 32768 ** 2 <= 0.3 ** 2):
                break
        else:
            if not 0.8 <= powers[0] / powers[1] <= 1.25:
                continue
            for tone, basis in enumerate(bases):
                matches = True
                for channel in range(2):
                    values = samples[2 * start + channel:2 * (start + size):2]
                    real = sum(x * b[0] for x, b in zip(values, basis))
                    imag = sum(x * b[1] for x, b in zip(values, basis))
                    if 2 * (real * real + imag * imag) / (size * powers[channel]) < 0.9:
                        matches = False
                        break
                if matches:
                    found[tone].append(start / 48000)
    if (len(found[0]) < 6 or len(found[1]) < 6 or
            not 0.5 <= found[1][0] - found[0][0] <= 1.0 or found[0][-1] >= found[1][0]):
        raise RuntimeError('capture lacks the ordered 997/1499 Hz public fixture signal')
    return 'PCM16 stereo48k: ordered 997/1499 Hz signal captured'


def exercise(zinc, arecord, card, subdevice, status, directory):
    config = directory / 'alsa.conf'
    config.write_text(alsa_config(card, subdevice))
    env = child_env(config)
    capture, player = Child(), Child()
    wav = directory / 'capture.wav'
    deadline = time.monotonic() + 15
    try:
        with selectors.DefaultSelector() as selector:
            capture.start([arecord, '-N', '-D', 'zinc_capture', '-t', 'wav', '-f', 'S16_LE',
                           '-c', '2', '-r', '48000', '-d', '6', str(wav)], env, selector)
            ready_deadline = min(deadline, time.monotonic() + 3)
            while not capture_ready(status.read_text(), capture.process.pid):
                if capture.process.poll() is not None:
                    raise RuntimeError('arecord exited before the capture PCM was ready')
                drain(selector, ready_deadline)
            fixture = Path(__file__).resolve().parent.parent / 'tests/data/audio/loopback.ts'
            player.start([zinc, 'run', '--interp', str(fixture)], env, selector)
            while selector.get_map() or capture.process.poll() is None or player.process.poll() is None:
                drain(selector, deadline)
                if wav.exists() and wav.stat().st_size > 2_000_000:
                    raise RuntimeError('capture exceeded 2 MB')
            if capture.process.returncode != 0 or player.process.returncode != 0:
                raise RuntimeError('capture or public audio fixture failed')
            if player.output.decode(errors='replace').splitlines().count('audio loopback fixture ok') != 1:
                raise RuntimeError('public ALSA fixture did not finish')
            return check_capture(wav)
    finally:
        mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        errors = []
        for child, name in ((player, 'player'), (capture, 'capture')):
            try:
                child.close()
            except (OSError, RuntimeError, subprocess.SubprocessError) as e:
                errors.append(str(e))
            try:
                (directory / (name + '.log')).write_bytes(child.output[:65536])
            except OSError as e:
                errors.append(str(e))
        if errors:
            # Exit with signals still blocked so no later signal hides the retained-PID report.
            raise ChildAlive('; '.join(errors))
        signal.pthread_sigmask(signal.SIG_SETMASK, mask)


def self_check():
    from unittest.mock import patch
    assert capture_ready('state: RUNNING\nowner_pid : 123\n', 123)
    assert capture_ready('state: PREPARED\nowner_pid : 123\n', 123)
    assert not capture_ready('state: RUNNING\nowner_pid : 456\n', 123)
    assert not capture_ready('state: XRUN\nowner_pid : 123\n', 123) and not capture_ready('closed\n', 123)
    config = alsa_config('Loopback', 3)
    assert config.count('type hw') == 2 and 'include' not in config and 'dmix' not in config
    with patch.dict(os.environ, {'ZINC_HEADLESS': '1', 'ZINC_AUDIO': 'null', 'ZINC_RECORD': '0', 'ALSA_CONFIG_PATH': 'foreign'}):
        env = child_env(Path('/private/alsa.conf'))
        assert env['ALSA_CONFIG_PATH'] == '/private/alsa.conf' and env['ZINC_NATIVE'] == 'real'
        assert all(key not in env for key in ('ZINC_HEADLESS', 'ZINC_AUDIO', 'ZINC_RECORD'))
    for card, sub in (('../bad', 0), ('Loopback"', 0), ('Loopback', -1), ('Loopback', 8)):
        try:
            card_identity(card, sub)
        except Skip:
            pass
        else:
            raise AssertionError('unsafe card/subdevice accepted')
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        proc, sound, dev = root / 'proc', root / 'sound', root / 'dev'
        (proc / 'card2').mkdir(parents=True)
        (proc / 'card2/id').write_text('Loopback\n')
        driver = sound / 'card2/device/driver'
        driver.mkdir(parents=True)
        module = root / 'modules/snd_aloop'
        module.mkdir(parents=True)
        (driver / 'module').symlink_to(module, target_is_directory=True)
        dev.mkdir()
        for name in ('pcmC2D0p', 'pcmC2D1c'):
            (dev / name).touch()
        with patch('stat.S_ISCHR', return_value=True):
            expected = proc / 'card2/pcm1c/sub3/status'
            assert card_identity('Loopback', 3, proc, sound, dev) == expected
            (dev / 'pcmC0D0p').touch()
            try:
                card_identity('Loopback', 3, proc, sound, dev)
            except Skip as e:
                assert 'another playback PCM' in str(e)
            else:
                raise AssertionError('accessible physical playback accepted')
            (dev / 'pcmC0D0p').unlink()
            (driver / 'module').unlink()
            foreign = root / 'modules/foreign'
            foreign.mkdir()
            (driver / 'module').symlink_to(foreign, target_is_directory=True)
            try:
                card_identity('Loopback', 3, proc, sound, dev)
            except Skip as e:
                assert 'not driven by snd_aloop' in str(e)
            else:
                raise AssertionError('physical driver accepted as loopback')
    from types import SimpleNamespace
    class FakeSelector:
        def select(self, timeout):
            return [(SimpleNamespace(fileobj=SimpleNamespace(fileno=lambda: 123), data=Child()), None)]
    with patch('os.read', return_value=b'x' * 70000):
        try:
            drain(FakeSelector(), time.monotonic() + 1)
        except RuntimeError as e:
            assert 'output exceeded' in str(e)
        else:
            raise AssertionError('output cap not enforced')
    try:
        drain(FakeSelector(), time.monotonic() - 1)
    except RuntimeError as e:
        assert 'deadline' in str(e)
    else:
        raise AssertionError('deadline not enforced')
    def synthetic(path, first=997, second=1499, mode='tone', channels=2):
        samples = array('h')
        for i in range(144000):
            t = i / 48000
            hz = first if 0.3 <= t < 0.9 else second if 1.05 <= t < 1.65 else 0
            v = int(4096 * math.sin(2 * math.pi * hz * t)) if hz else 0
            if mode == 'silent':
                v = 0
            elif mode == 'clipped':
                v = 32767 if v >= 0 else -32768
            elif mode == 'noise':
                v = (i * 7919 % 8192) - 4096
            samples.extend([v] * channels)
        if sys.byteorder != 'little':
            samples.byteswap()
        with wave.open(str(path), 'wb') as wav:
            wav.setparams((channels, 2, 48000, 0, 'NONE', 'not compressed'))
            wav.writeframes(samples.tobytes())
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'signal.wav'
        synthetic(path)
        assert 'ordered' in check_capture(path)
        for args in ({'mode': 'silent'}, {'first': 800, 'second': 1200}, {'first': 1499, 'second': 997},
                     {'mode': 'noise'}, {'mode': 'clipped'}, {'channels': 1}):
            synthetic(path, **args)
            try:
                check_capture(path)
            except RuntimeError:
                pass
            else:
                raise AssertionError('invalid capture accepted: ' + str(args))
        synthetic(path)
        path.write_bytes(path.read_bytes()[:-100])
        try:
            check_capture(path)
        except RuntimeError:
            pass
        else:
            raise AssertionError('truncated capture accepted')
        path.write_bytes(b'not a WAV')
        try:
            check_capture(path)
        except (RuntimeError, wave.Error, EOFError):
            pass
        else:
            raise AssertionError('malformed capture accepted')
    child = Child()
    child.close()
    child.close()
    try:
        child.transition(Phase.RUNNING)
    except RuntimeError:
        pass
    else:
        raise AssertionError('closed child restarted')
    class Exited:
        pid = 123
        stdout = io.BytesIO()
        def poll(self):
            return 0
        def wait(self, timeout):
            return 0
    child = Child()
    child.process = Exited()
    child.transition(Phase.RUNNING)
    with patch('os.killpg') as killed:
        child.close()
        killed.assert_not_called()
    assert child.phase == Phase.CLOSED
    class Stuck:
        pid = 123
        stdout = io.BytesIO()
        def poll(self):
            return None
        def wait(self, timeout):
            raise subprocess.TimeoutExpired('pure-self-check', timeout)
    child = Child()
    child.process = Stuck()
    child.transition(Phase.RUNNING)
    with patch('os.killpg') as killed:
        try:
            child.close()
        except ChildAlive as e:
            assert 'PID 123' in str(e) and child.phase == Phase.RETAINED
        else:
            raise AssertionError('unreaped child hidden')
        killed.assert_called_once_with(123, signal.SIGKILL)
    print('audio-loopback pure self-check ok (no audio/device access)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-check', action='store_true')
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return 0
    if os.environ.get('ZINC_AUDIO_LOOPBACK_TEST') != '1':
        raise Skip('set ZINC_AUDIO_LOOPBACK_TEST=1 only in an owner-prepared isolated image')
    if sys.platform != 'linux':
        raise Skip('Linux snd-aloop is required')
    zinc = os.environ.get('ZINC', '')
    arecord = shutil.which('arecord')
    card = os.environ.get('ZINC_AUDIO_LOOPBACK_CARD', '')
    sub = os.environ.get('ZINC_AUDIO_LOOPBACK_SUBDEVICE', '')
    if not zinc or not Path(zinc).is_absolute() or not Path(zinc).is_file() or not os.access(zinc, os.X_OK) or not arecord:
        raise Skip('an absolute executable ZINC and existing arecord are required')
    if not re.fullmatch('[0-7]', sub):
        raise Skip('set the explicitly delegated ZINC_AUDIO_LOOPBACK_SUBDEVICE (0..7)')
    try:
        status = card_identity(card, int(sub))
        if status.read_text().strip() != 'closed':
            raise Skip('delegated loopback capture subdevice is busy')
        playback = status.parent.parent.parent / ('pcm0p/sub%s/status' % sub)
        if playback.read_text().strip() != 'closed':
            raise Skip('delegated loopback playback subdevice is busy')
    except OSError as e:
        raise Skip('prepared loopback unavailable: ' + str(e)) from e
    def interrupted(signum, frame):
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        raise RuntimeError('interrupted by signal ' + str(signum))
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    directory = Path(tempfile.mkdtemp(prefix='zinc-audio-loopback-'))
    try:
        result = exercise(zinc, arecord, card, int(sub), status, directory)
    except BaseException:
        print('Audio evidence retained: ' + str(directory), file=sys.stderr)
        raise
    else:
        shutil.rmtree(directory)
        print('audio loopback passed: ' + result)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Skip as e:
        print('SKIP audio_loopback: ' + str(e), file=sys.stderr)
        sys.exit(77)
    except (OSError, RuntimeError, subprocess.SubprocessError, wave.Error, EOFError) as e:
        print('FAIL audio_loopback: ' + str(e), file=sys.stderr)
        sys.exit(1)
