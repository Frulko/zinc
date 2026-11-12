// Real gpio-sim chardev-v2 only; paths are supplied by the owning Python runner.
import { select, setup, read, write, watch, unwatch, release, PinEdge } from 'zinc:gpio';
import { env } from 'zinc:sys';
import { readText, writeText } from 'zinc:fs';
function check(ok: boolean, message: string): void {
  if (!ok) throw new Error('gpio kernel: ' + message);
}
function pause(ms: i32): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }
const events: PinEdge[] = [];
async function until(count: i32): Promise<void> {
  const deadline = performance.now() + 2000;
  while (events.length < count && performance.now() < deadline) await pause(5);
  check(events.length === count, 'edge count/deadline');
}
function edgePair(): void {
  check(events.length === 2, 'two edges');
  check(events[0].pin === 22 && events[0].value === 1 && events[1].pin === 22 && events[1].value === 0, 'edge identity');
  check(events[0].timestampMs > 0 && events[1].timestampMs > events[0].timestampMs, 'kernel timestamps');
  check(events[0].sequence > 0 && events[1].sequence === events[0].sequence + 1, 'consecutive sequence');
}
async function main(): Promise<void> {
  const chip = env('ZINC_GPIO_KERNEL_CHIP');
  const label = env('ZINC_GPIO_KERNEL_LABEL');
  const output = env('ZINC_GPIO_KERNEL_OUT');
  const input = env('ZINC_GPIO_KERNEL_IN');
  const outValue = env('ZINC_GPIO_KERNEL_OUT_VALUE');
  const inValue = env('ZINC_GPIO_KERNEL_IN_VALUE');
  const pull = env('ZINC_GPIO_KERNEL_PULL');
  check(chip.startsWith('/dev/gpiochip') && label.startsWith('zinc-549-') && pull.startsWith('/sys/devices/platform/gpio-sim.'), 'owned kernel paths required');
  try {
    select(20, chip, output);
    setup(20, 'out', 'keep', 'push-pull', 1);
    check(read(20) === 1 && readText(outValue).trim() === '1', 'initial output');
    write(20, 0);
    check(read(20) === 0 && readText(outValue).trim() === '0', 'set/get output');
    select(21, label, output);
    let rejected = false;
    try { setup(21, 'out', 'keep'); } catch (e) { rejected = true; }
    check(rejected, 'line request must be exclusive');
    release(20);
    setup(21, 'out', 'keep', 'push-pull', 1);
    check(read(21) === 1 && readText(outValue).trim() === '1', 'release permits next owner');
    release(21);

    select(22, chip, input);
    setup(22, 'in', 'up');
    check(read(22) === 1 && readText(inValue).trim() === '1', 'observable pull-up');
    setup(22, 'in', 'down');
    check(read(22) === 0 && readText(inValue).trim() === '0', 'observable pull-down');
    setup(22, 'in', 'keep');
    writeText(pull, 'pull-down\n');
    watch(22, 'both', 0, (e: PinEdge) => { events.push(e); });
    writeText(pull, 'pull-up\n');
    await until(1);
    writeText(pull, 'pull-down\n');
    await until(2);
    edgePair();
    release(22);

    select(22, label, input);
    setup(22, 'in', 'keep');
    writeText(pull, 'pull-down\n');
    events.length = 0;
    watch(22, 'both', 200, (e: PinEdge) => { events.push(e); });
    const pulseStart = performance.now();
    writeText(pull, 'pull-up\n');
    await pause(10);
    writeText(pull, 'pull-down\n');
    check(performance.now() - pulseStart < 50, 'short-pulse timing inconclusive under load');
    await pause(350);
    check(events.length === 0 && read(22) === 0 && readText(inValue).trim() === '0', 'debounce filters short pulse');
    writeText(pull, 'pull-up\n');
    await until(1);
    check(read(22) === 1 && readText(inValue).trim() === '1', 'debounced stable high');
    writeText(pull, 'pull-down\n');
    await until(2);
    check(read(22) === 0 && readText(inValue).trim() === '0', 'debounced stable low');
    edgePair();
    unwatch(22);
    writeText(pull, 'pull-up\n');
    await pause(250);
    check(events.length === 2, 'unwatch stops callbacks');
    release(22);
    select(21, chip, input);
    setup(21, 'in', 'keep');
    check(read(21) === 1, 'input ownership released');
  } finally {
    release(20);
    release(21);
    release(22);
  }
  console.log('gpio kernel ok');
}
main();
