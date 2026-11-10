class Animal { name: string; constructor(name: string) { this.name = name; } speak(): string { return this.name; } }
class Dog extends Animal { bark(): string { return this.name + '!'; } }
const dogs: Dog[] = [new Dog('b'), new Dog('a')];
const animals: Animal[] = dogs;
console.log('identity', dogs === animals);
animals.push(new Dog('c')); dogs.push(new Dog('d'));
console.log('mutations', dogs.length, animals.length, dogs[2].bark());
function relay(a: Animal[]): Animal[] { return a; }
let global: Animal[] = relay(dogs);
const capture = (): Animal[] => global;
console.log('boundaries', relay(dogs) === dogs, capture() === dogs);
class DogZoo { animals: Dog[] = dogs; }
type Zoo = { animals: Animal[] };
const dz = new DogZoo(); const z: Zoo = dz;
console.log('field', z.animals === dogs);
const replacement: Dog[] = [new Dog('replacement')]; const widened: Animal[] = replacement;
z.animals = widened;
console.log('replace', dz.animals === replacement, dz.animals[0].bark());
animals.sort((a: Animal, b: Animal): number => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
console.log('sort', dogs[0].bark());
const independent = animals.slice(0, 2); independent.push(new Animal('base'));
console.log('slice', independent.length, dogs.length, independent === dogs);
animals.copyWithin(0, 1, 2); animals.reverse();
const last = animals.pop();
console.log('reorder', last.name, dogs.length, dogs[0].bark());
const [first, ...rest] = animals;
rest.push(new Animal('rest'));
console.log('destructure', first.name, rest.length, dogs.length);
const dynamic: any = animals;
console.log('observe', dynamic.length, JSON.stringify(animals));
interface Named { name: string }
interface Detailed { name: string; id: i32 }
const details: Detailed[] = [{ name: 'detail', id: 1 }]; const names: Named[] = details;
names[0].name = 'changed'; names.push({ name: 'next', id: 2 } as Detailed);
console.log('records', names === details, details[0].name, details.length);

console.log('clock', Date.now() >= 0);
