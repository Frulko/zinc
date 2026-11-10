class Animal { name = 'animal'; }
class Dog extends Animal { bark(): string { return 'woof'; } }
const dogs: Dog[] = [new Dog()]; const animals: Animal[] = dogs;
animals.push(new Dog());
console.log(dogs === animals, dogs.length);

class ref {}
const marker = new ref();
console.log(marker instanceof ref);
