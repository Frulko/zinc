// zinc:location without native code (ZINC_NATIVE=sim, --target sim): no provider. The fake one (ZINC_FAKE_LOCATION) lives in index.ts.
export default {
  allowed: (): string => '',
  permission: (_ask: boolean): i32 => 5,
  start: (_accuracy: number, _distance: number): void => {},
  stop: (): void => {},
  fix: (): number[] => [0, 0, 0, 0, 0, 0, 0, 0, 0],
  error: (): string => '',
};
