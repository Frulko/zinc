// hello: a first Zinc program. It greets, counts, shops and prints a few numbers, one section at a time.
// The same source prints exactly the same bytes on every target (the sim on Node is the reference).
import { section, line } from './report';
import { greet, Greeter } from './greeting';
import { Counter } from './counter';
import { BASKET, totalCents, pricierThan, countByAisle, euros } from './basket';

function greetings(): void {
  section('Greetings');
  console.log(greet('Zinc'));
  const french = new Greeter({ salutation: 'Bonjour', excited: false });
  for (const name of ['Ada', 'Grace']) console.log(french.greet(name));
  line('greeted', `${french.greeted} people`);
}

function counting(): void {
  section('A counter');
  const counter = new Counter(2);
  for (let i = 0; i < 5; i++) counter.increment();
  line('value', `${counter.value}`);
  line('trail', counter.trail);
}

function shopping(): void {
  section('A shopping basket');
  line('items', BASKET.map(item => item.name).join(', '));
  line('total', `${euros(totalCents(BASKET))} EUR`);
  line('over 3 EUR', pricierThan(BASKET, 300).join(', ').toUpperCase());
  for (const [aisle, count] of countByAisle(BASKET)) line(aisle, `${count}`);
}

function numbers(): void {
  // printed exactly like Node prints them, in the target's number type (f64; f32 on ESP32, fixed point on PS1)
  section('Numbers');
  line('1 / 3', `${1 / 3}`);
  line('0.1 + 0.2', `${0.1 + 0.2}`);
  line('1e21', `${1e21}`);
  line('-0', `${-0}`);
  console.log('array      ', [1, 2.5, 3]);   // arrays print like Node prints them
}

greetings();
counting();
shopping();
numbers();
