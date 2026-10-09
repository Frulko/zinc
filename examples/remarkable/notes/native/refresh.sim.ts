let current = 1;
export default {
  setFast(fast: boolean): boolean { current = fast ? 1 : 4; return true; },
  mode(): number { return current; },
  busy(): boolean { return false; },
};
