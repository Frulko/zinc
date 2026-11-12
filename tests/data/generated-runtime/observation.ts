import { BOARD, SOC, RAM_MB, REVISION, has } from 'zinc:platform';
console.log(BOARD, SOC, RAM_MB, REVISION, has('gpio'), has('i2c'), has('hwdec-h264'));
