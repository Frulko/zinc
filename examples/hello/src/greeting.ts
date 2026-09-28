// Greetings: a plain function, and a small class with options and a default.

/** "Hello, Zinc!" */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export interface GreeterOptions {
  salutation: string;    // "Hello", "Bonjour"...
  excited: boolean;      // ends with "!" instead of "."
}

/** Greets people in one style and counts how many it greeted. */
export class Greeter {
  private options: GreeterOptions;
  greeted: i32 = 0;

  constructor(options: GreeterOptions) {
    this.options = options;
  }

  greet(name: string): string {
    this.greeted++;
    const end = this.options.excited ? '!' : '.';
    return `${this.options.salutation}, ${name}${end}`;
  }
}
