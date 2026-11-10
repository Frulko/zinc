// Remaining ZN-1030 gap; not part of the passing method regression.
class Animal { name='animal'; } class Dog extends Animal { bark():string { return 'woof'; } } class DogZoo { animals:Dog[]=[new Dog()]; } type Zoo={animals:Animal[]}; const dz=new DogZoo(); const z:Zoo=dz; z.animals.push(new Dog()); console.log(dz.animals.length,z.animals.length);
