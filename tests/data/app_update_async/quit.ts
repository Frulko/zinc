import { check } from 'zinc:system/update';
import { env, exit } from 'zinc:sys';
import { onFrame } from 'zinc:gfx';
onFrame(() => { check(env('UPDATE_URL')); exit(0); });
