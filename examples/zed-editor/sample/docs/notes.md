# Field notes

The station sits on the north wall, **1.8 m** above the ground, away from direct sun.

## Calibration

1. Compare with the reference thermometer at noon.
2. Write the offset in `data/readings.json` if it drifts by more than *0.3 °C*.

```ts
const offset = reference - measured;
```

See the [Zinc docs](../../../../docs/guide/README.md) for the sensor drivers.
