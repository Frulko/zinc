// Remaining ZN-1030 gap; not part of the passing method regression.
class Animal { name='animal'; } class Dog extends Animal { bark():string { return 'woof'; } } class Cat extends Animal {} class DogZoo { star:Dog=new Dog(); } type Zoo={star:Animal}; const dz=new DogZoo(); const z:Zoo=dz; try { z.star=new Cat(); console.log(z.star.name); } catch(e) { console.log(e instanceof TypeError); }
