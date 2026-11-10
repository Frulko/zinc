class Animal { name = 'animal'; }
class Dog extends Animal { bark(): string { return 'woof'; } }
const dogs: Dog[] = [new Dog(), new Dog()]; const animals: Animal[] = dogs;
const base = new Animal(); const dog = new Dog();
const first = dogs[0], second = dogs[1];
let refused: i32 = 0;
try { animals[0] = base; } catch (e) { if (e instanceof TypeError) refused++; }
try { animals.push(base); } catch (e) { if (e instanceof TypeError) refused++; }
try { animals.push(dog, base); } catch (e) { if (e instanceof TypeError) refused++; }
const items: Animal[] = [dog, base];
try { animals.push(...items); } catch (e) { if (e instanceof TypeError) refused++; }
try { animals.unshift(base); } catch (e) { if (e instanceof TypeError) refused++; }
try { animals.splice(0, 1, dog, base); } catch (e) { if (e instanceof TypeError) refused++; }
try { animals.fill(base); } catch (e) { if (e instanceof TypeError) refused++; }
try { animals.set(items); } catch (e) { if (e instanceof TypeError) refused++; }
class DogZoo { animals: Dog[] = dogs; }
type Zoo = { animals: Animal[] }; const dz = new DogZoo(); const z: Zoo = dz;
try { z.animals = items; } catch (e) { if (e instanceof TypeError) refused++; }
console.log('refused', refused, dogs.length, dogs[0] === first, dogs[1] === second, z.animals === dogs);
animals.fill(base, -50, -50); animals.fill(base, 5, -1); animals.fill(base, 2, 50);
animals.fill(base, 1, 1); animals.fill(base, 50); animals.set(items, 2); animals.set(items, 0, 1, 1);
console.log('empty', dogs.length, dogs[0].bark());
animals.set(items, -1, 0, 2); animals.set(items, 0, 0, 1);
animals.fill(dog, -1); animals.splice(1, 1, dog); animals.unshift(dog);
console.log('safe', dogs.length, dogs[0].bark());

interface LiveZoo { animals: Animal[]; label(): string }
class Kennel implements LiveZoo { animals: Dog[] = dogs; label(): string { return 'kennel'; } }
const kennel = new Kennel(); const live: LiveZoo = kennel;
try { live.animals = items; } catch (e) { if (e instanceof TypeError) refused++; }
const fresh: Dog[] = [new Dog()]; const freshWide: Animal[] = fresh; live.animals = freshWide;
console.log('interface', refused, kennel.animals === fresh, live.animals === fresh, kennel.animals[0].bark());
