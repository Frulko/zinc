// lang: a guided tour of the TypeScript subset Zinc compiles, one printed section per topic.
// Every line prints the same bytes natively and on the sim (Node), which is how `zinc test` checks targets.
import { classes, generics } from './tour/classes';
import { closures } from './tour/functions';
import { machineIntegers, numberFormatting } from './tour/numbers';
import { enums } from './tour/enums';
import { strings } from './tour/strings';
import { collections } from './tour/collections';
import { controlFlow } from './tour/control-flow';

classes();
generics();
closures();
machineIntegers();
enums();
strings();
collections();
controlFlow();
numberFormatting();
