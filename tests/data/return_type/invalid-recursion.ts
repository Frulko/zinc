function recursive() { const value: ReturnType<typeof recursive> = recursive(); return value; }
type Result = ReturnType<typeof recursive>;
