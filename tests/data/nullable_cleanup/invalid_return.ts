const dynamic: any = 1;
function effect(callback: () => (() => void) | undefined): void { callback(); }
effect(() => 42);
