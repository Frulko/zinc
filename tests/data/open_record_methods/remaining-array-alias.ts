// Remaining ZN-1030 gap: the widened array must alias the original.
class Animal { name = 'animal'; }
class Dog extends Animal { bark(): string { return 'woof'; } }
const dogs: Dog[] = [new Dog()];
const animals: Animal[] = dogs;
animals.push(new Dog());
console.log(dogs.length, animals.length);
dogs.push(new Dog());
console.log(dogs.length, animals.length);
