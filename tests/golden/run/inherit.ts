class Animal {
  legs: i32;
  constructor(legs: i32) {
    this.legs = legs;
  }
  sound(): i32 {
    return 0;
  }
  describe(): i32 {
    return this.legs * 10 + this.sound();
  }
}
class Dog extends Animal {
  tricks: i32 = 3;
  constructor() {
    super(4);
  }
  sound(): i32 {
    return 1;
  }
}
class Bird extends Animal {
  constructor() {
    super(2);
  }
  sound(): i32 {
    return 2 + super.sound();
  }
}
function twice(a: Animal): i32 {
  return a.sound() * 2;
}
const d = new Dog();
const b = new Bird();
console.log(d.describe(), b.describe(), d.tricks, d.legs);
console.log(twice(d), twice(b));
