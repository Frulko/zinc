// sort() without a comparator orders the elements by their text, as JavaScript does (so 10 comes before 9), in place.
const names: string[] = ['track', 'api_key', 'artist[1]', 'artist[0]', 'Z', 'é'];
names.sort();
console.log(names.join(' '));
const nums: number[] = [10, 9, 1, 100, -1];
console.log(nums.sort().join(' '), nums[0]);
const flags: boolean[] = [true, false, true];
console.log(flags.sort().join(' '));
