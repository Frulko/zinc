import { BOARD, SOC, RAM_MB, REVISION, has } from 'zinc:board';
console.log(BOARD === '', SOC === '', RAM_MB === 0, REVISION === '', has('gpio'), has('i2c'), has('spi'), has('pwm'), has('hwdec-h264'), has('wifi'), has('ble'), has('unknown'));
