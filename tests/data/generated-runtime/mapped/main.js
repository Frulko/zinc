import { SCREEN_W } from 'zinc:platform';
import * as platform from 'zinc:platform';
const dynamic = await import('zinc:platform');
console.log(SCREEN_W, platform.BOARD, dynamic === platform);
