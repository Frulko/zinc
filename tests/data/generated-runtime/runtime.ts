import { BOARD as observed, SOC, RAM_MB, REVISION, has, SCREEN_W } from 'zinc:platform';
import { BOARD, SOC as soc, RAM_MB as ram, REVISION as rev, has as boardHas } from 'zinc:board';
console.log(observed === BOARD, SOC === soc, RAM_MB === ram, REVISION === rev, has('gpio') === boardHas('gpio'), SCREEN_W > 0);
