// The board side of examples/serial: prints the voltage on pin A0 (0 to 1023) fifty times a second.
// A potentiometer between 5V and GND with its middle pin on A0, a light sensor, or nothing at all (a floating pin wanders).
void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(analogRead(A0));
  delay(20);
}
