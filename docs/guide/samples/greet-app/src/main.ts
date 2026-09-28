// Uses the project-local plugin in ./plugins/greet (resolved by its plugin.json "module": "zinc:greet").
import { greeting, shout } from 'zinc:greet';

console.log(greeting('Zinc'));
console.log(shout('world'));
