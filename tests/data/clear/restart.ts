import { initialize, activeList, visibleTasks } from '../../../examples/clear/src/state';
import { equal } from 'zinc:assert';
initialize();
equal(activeList()!.title, 'Weekend');
equal(visibleTasks().length, 1);
equal(visibleTasks()[0].title, 'Pull-created');
equal(visibleTasks()[0].completed, true);
console.log('clear restart: pass');
