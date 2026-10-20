// A window of one colour: tests/t1/run_app_name.sh reads the name `zinc run` gives it.
import { onFrame, clear } from 'zinc:gfx';
onFrame((dt: number) => { clear(0x102030); });
