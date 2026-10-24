// tests/t1/device_screen.sh: a program that draws one colour, frame after frame, for zinc device screen to capture.
import { onFrame, clear } from 'zinc:gfx';

onFrame((dt: number) => { clear(0x3366cc); });
