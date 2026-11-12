#!/usr/bin/env python3
"""Opt-in public GPIO-v2 integration against an already prepared Linux gpio-sim."""
import argparse
from enum import Enum, auto
import os
from pathlib import Path
import re
import secrets
import selectors
import signal
import stat
import subprocess
import sys
import tempfile
import time


class Skip(Exception):
    pass


class ChildAlive(RuntimeError):
    pass


def unescape_mount(value):
    return re.sub(r"\\([0-7]{3})", lambda m: chr(int(m[1], 8)), value)


def configfs_mounts(text):
    mounts = []
    for line in text.splitlines():
        before, sep, after = line.partition(" - ")
        fields = before.split()
        if sep and len(fields) >= 6 and after.split() and after.split()[0] == "configfs":
            mounts.append(Path(unescape_mount(fields[4])))
    return mounts


def validated_root(root, mountinfo):
    root = root.resolve(strict=True)
    if root.name != "gpio-sim" or root.parent not in configfs_mounts(mountinfo):
        raise Skip("gpio-sim must be a direct subsystem of mounted configfs")
    if not root.is_dir() or not os.access(root, os.W_OK | os.X_OK):
        raise Skip("gpio-sim configfs access has not been delegated")
    return root


def kernel_names(device, chip):
    if not re.fullmatch(r"gpio-sim\.[0-9]+", device):
        raise RuntimeError("invalid gpio-sim dev_name")
    if not re.fullmatch(r"gpiochip[0-9]+", chip) or int(chip[8:]) >= 256:
        raise RuntimeError("unsupported gpio-sim chip_name (Zinc enumerates 0..255)")
    return device, chip


def contained(path, parent):
    path = path.resolve(strict=True)
    if not path.is_relative_to(parent.resolve(strict=True)):
        raise RuntimeError("gpio-sim sysfs path escaped its owned platform device")
    return path


class Phase(Enum):
    NEW = auto()
    CONFIGURING = auto()
    LIVE = auto()
    CLOSED = auto()
    RETAINED = auto()


class Chip:
    def __init__(self, root):
        self.path = root / ("zinc-549-" + secrets.token_hex(8))
        self.phase = Phase.NEW
        self.directories = []

    def transition(self, next_phase):
        allowed = {Phase.NEW: (Phase.CONFIGURING, Phase.CLOSED, Phase.RETAINED),
                   Phase.CONFIGURING: (Phase.LIVE, Phase.CLOSED, Phase.RETAINED),
                   Phase.LIVE: (Phase.CLOSED, Phase.RETAINED), Phase.CLOSED: (), Phase.RETAINED: ()}
        if next_phase not in allowed[self.phase]:
            raise RuntimeError("invalid gpio-sim lifecycle transition")
        self.phase = next_phase

    def mkdir(self, path):
        # Record ownership before a queued termination signal can interrupt cleanup.
        mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            path.mkdir()
            self.directories.append(path)
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, mask)

    def create(self):
        self.mkdir(self.path)
        self.transition(Phase.CONFIGURING)
        bank = self.path / "bank0"
        self.mkdir(bank)
        (bank / "num_lines").write_text("2\n")
        label = self.path.name
        (bank / "label").write_text(label + "\n")
        for i in range(2):
            line = bank / ("line" + str(i))
            self.mkdir(line)
            (line / "name").write_text(label + "-" + str(i) + "\n")
        (self.path / "live").write_text("1\n")
        self.transition(Phase.LIVE)
        device, chip = kernel_names((self.path / "dev_name").read_text().strip(),
                                    (bank / "chip_name").read_text().strip())
        platform = Path("/sys/devices/platform") / device
        base = contained(platform / chip, platform)
        node = Path("/dev") / chip
        if not stat.S_ISCHR(node.stat().st_mode) or not os.access(node, os.R_OK | os.W_OK):
            raise RuntimeError("owned gpio-sim character device is inaccessible")
        controls = [contained(base / ("sim_gpio" + str(i)) / name, platform)
                    for i, name in ((0, "value"), (1, "value"), (1, "pull"))]
        for p in controls:
            if not p.is_file() or not os.access(p, os.R_OK):
                raise RuntimeError("owned gpio-sim control is inaccessible")
        if not os.access(controls[2], os.W_OK):
            raise RuntimeError("owned gpio-sim pull control is not writable")
        return dict(ZINC_GPIO_KERNEL_CHIP=str(node), ZINC_GPIO_KERNEL_LABEL=label,
                    ZINC_GPIO_KERNEL_OUT=label + "-0", ZINC_GPIO_KERNEL_IN=label + "-1",
                    ZINC_GPIO_KERNEL_OUT_VALUE=str(controls[0]),
                    ZINC_GPIO_KERNEL_IN_VALUE=str(controls[1]),
                    ZINC_GPIO_KERNEL_PULL=str(controls[2]))

    def cleanup(self, write=None, remove=None):
        if self.phase == Phase.CLOSED:
            return
        mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            write = write or (lambda p, text: p.write_text(text))
            remove = remove or (lambda p: p.rmdir())
            errors = []
            if self.directories:
                try:
                    write(self.path / "live", "0\n")
                except OSError as e:
                    errors.append(str(e))
                for directory in reversed(self.directories):
                    try:
                        remove(directory)
                    except OSError as e:
                        errors.append(str(e))
            self.transition(Phase.RETAINED if errors else Phase.CLOSED)
            if errors:
                raise RuntimeError("cleanup failed for " + str(self.path) + ": " + "; ".join(errors))
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, mask)


def stop_child(child):
    if child is not None and child.poll() is None:
        mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=5)
        except subprocess.TimeoutExpired as e:
            # Keep termination blocked until failure exits, preserving the retained-child report.
            raise ChildAlive("killed fixture PID " + str(child.pid) + " is not reaped; retain its owned chip") from e
        else:
            signal.pthread_sigmask(signal.SIG_SETMASK, mask)


def run_fixture(zinc, additions):
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("ZINC_GPIO_") or key in ("ZINC_DETERMINISTIC", "ZINC_FRAMES", "ZINC_DURATION", "ZINC_PLATFORM", "ZINC_PROFILE", "ZINC_SIMULATE", "ZINC_NATIVE"):
            env.pop(key)
    env.update(additions, ZINC_NATIVE="real", ZINC_HEADLESS="1", ZINC_BACKGROUND="1")
    fixture = Path(__file__).resolve().parent.parent / "tests/data/gpio/kernel.ts"
    child = None
    output = bytearray()
    try:
        child = subprocess.Popen([zinc, "run", "--interp", str(fixture)], env=env,
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        deadline = time.monotonic() + 15
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RuntimeError("public kernel GPIO fixture timed out")
                for key, _ in selector.select(min(remaining, 0.1)):
                    data = os.read(key.fileobj.fileno(), 4096)
                    if not data:
                        selector.unregister(key.fileobj)
                    else:
                        output.extend(data)
                        if len(output) > 65536:
                            raise RuntimeError("public kernel GPIO output exceeded 64 KiB")
        code = child.wait(timeout=max(0.001, deadline - time.monotonic()))
    finally:
        try:
            stop_child(child)
        finally:
            if child is not None and child.stdout is not None:
                child.stdout.close()
            sys.stdout.buffer.write(output[:65536])
    if code != 0 or output.decode(errors="replace").splitlines().count("gpio kernel ok") != 1:
        raise RuntimeError("public kernel GPIO fixture failed")


def exercise(chip, zinc):
    try:
        run_fixture(zinc, chip.create())
    except ChildAlive:
        chip.transition(Phase.RETAINED)
        print("Owned gpio-sim retained while child is unreaped: " + str(chip.path), file=sys.stderr)
        raise
    finally:
        if chip.phase != Phase.RETAINED:
            chip.cleanup()


def self_check():
    assert configfs_mounts("1 0 0:1 / /config\\040test rw - configfs none rw") == [Path("/config test")]
    assert configfs_mounts("1 0 0:1 / /config rw - ") == []
    assert kernel_names("gpio-sim.3", "gpiochip7") == ("gpio-sim.3", "gpiochip7")
    for device, chip in (("../gpio-sim.0", "gpiochip0"), ("gpio-sim.0", "../gpiochip0"), ("gpio-sim.0", "gpiochip256")):
        try:
            kernel_names(device, chip)
        except RuntimeError:
            pass
        else:
            raise AssertionError("unsafe kernel identity accepted")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "gpio-sim"
        root.mkdir()
        try:
            validated_root(root, "")
        except Skip:
            pass
        else:
            raise AssertionError("regular filesystem accepted as configfs")
        outside = Path(tmp) / "outside"
        outside.mkdir()
        (root / "escape").symlink_to(outside, target_is_directory=True)
        try:
            contained(root / "escape", root)
        except RuntimeError:
            pass
        else:
            raise AssertionError("sysfs path escape accepted")
        chip = Chip(root)
        chip.transition(Phase.CONFIGURING)
        chip.directories = [chip.path, chip.path / "bank0", chip.path / "bank0/line0"]
        calls = []
        chip.cleanup(lambda p, text: calls.append(("write", p, text)), lambda p: calls.append(("rmdir", p)))
        assert calls == [("write", chip.path / "live", "0\n")] + [("rmdir", p) for p in reversed(chip.directories)]
        chip.cleanup(lambda *_: (_ for _ in ()).throw(AssertionError("double cleanup")))
        chip = Chip(root)
        chip.transition(Phase.CONFIGURING)
        chip.directories = [chip.path]
        def fail_remove(path):
            raise OSError("injected cleanup failure")
        try:
            chip.cleanup(lambda *_: None, fail_remove)
        except RuntimeError as e:
            assert str(chip.path) in str(e)
        else:
            raise AssertionError("cleanup failure hidden")
    from unittest.mock import patch
    import io
    from types import SimpleNamespace
    class StuckChild:
        pid = 123
        def poll(self):
            return None
        def wait(self, timeout):
            raise subprocess.TimeoutExpired("pure-self-check", timeout)
    original_mask = signal.pthread_sigmask(signal.SIG_BLOCK, set())
    with patch("os.killpg") as killed:
        try:
            stop_child(StuckChild())
        except ChildAlive as e:
            assert "PID 123" in str(e)
        else:
            raise AssertionError("unreaped child accepted")
        killed.assert_called_once_with(123, signal.SIGKILL)
    signal.pthread_sigmask(signal.SIG_SETMASK, original_mask)
    class RetainedChip(Chip):
        def create(self):
            self.transition(Phase.CONFIGURING)
            self.transition(Phase.LIVE)
            return {}
        def cleanup(self):
            raise AssertionError("unreaped child's chip was deactivated/removed")
    chip = RetainedChip(Path("/pure-self-check-not-a-real-chip"))
    with patch(__name__ + ".run_fixture", side_effect=ChildAlive("injected unreaped PID 123")), patch("sys.stderr", new=io.StringIO()):
        try:
            exercise(chip, "unused")
        except ChildAlive:
            assert chip.phase == Phase.RETAINED
        else:
            raise AssertionError("unreaped child accepted")
    with tempfile.TemporaryDirectory() as tmp:
        executable = Path(tmp) / "output-child"
        executable.write_text("#!" + sys.executable + "\nimport os\nos.write(1, b'x' * 70000)\n")
        executable.chmod(0o700)
        sink = io.BytesIO()
        with patch("sys.stdout", new=SimpleNamespace(buffer=sink)):
            try:
                run_fixture(str(executable), {})
            except RuntimeError as e:
                assert "output exceeded" in str(e)
            else:
                raise AssertionError("output cap not enforced")
        assert len(sink.getvalue()) <= 65536
        executable.write_text("#!" + sys.executable + "\nimport time\ntime.sleep(30)\n")
        with patch(__name__ + ".time", new=SimpleNamespace(monotonic=iter([0, 16]).__next__)), patch("sys.stdout", new=SimpleNamespace(buffer=io.BytesIO())):
            try:
                run_fixture(str(executable), {})
            except RuntimeError as e:
                assert "timed out" in str(e)
            else:
                raise AssertionError("fixture deadline not enforced")

    print("gpio-sim pure self-check ok (no kernel test)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--config-root", type=Path, default=Path("/sys/kernel/config/gpio-sim"))
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return 0
    if os.environ.get("ZINC_GPIO_KERNEL_TEST") != "1":
        raise Skip("set ZINC_GPIO_KERNEL_TEST=1 only in an owner-prepared image")
    if sys.platform != "linux":
        raise Skip("Linux gpio-sim kernel is required")
    zinc = os.environ.get("ZINC", "")
    if not zinc or not Path(zinc).is_file() or not os.access(zinc, os.X_OK):
        raise Skip("ZINC must name an executable Linux Zinc")
    try:
        root = validated_root(args.config_root, Path("/proc/self/mountinfo").read_text())
    except OSError as e:
        raise Skip("prepared configfs gpio-sim unavailable: " + str(e)) from e
    def interrupted(signum, frame):
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        raise RuntimeError("interrupted by signal " + str(signum))
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    exercise(Chip(root), zinc)
    print("gpio-sim kernel integration passed; owned chip removed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Skip as e:
        print("SKIP gpio_kernel: " + str(e), file=sys.stderr)
        sys.exit(77)
    except (OSError, RuntimeError, subprocess.SubprocessError) as e:
        print("FAIL gpio_kernel: " + str(e), file=sys.stderr)
        sys.exit(1)
