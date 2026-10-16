import { ping, greet, watch } from 'zinc:beep';
console.log('beep ' + ping());
console.log(greet('zinc', true));
let seen = 0;
watch((n: i32, label: string) => {
  console.log('watch ' + n + ' ' + label);
  seen++;
});
setTimeout(() => console.log('callbacks ' + seen), 1500);
