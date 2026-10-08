// ZN-163: a class component in the React model (Inferno): props from the parent, state, setState and a re-render. render() logs, so the output shows each render.
import { Component, render } from 'inferno';

interface CounterProps { label: string; step: i32 }

let counter: Counter | null = null;

class Counter extends Component<CounterProps, i32> {
  constructor(props: CounterProps) {
    super(props);
    this.state = 0;
    if (counter === null) counter = this;   // the first one is the test handle
  }
  bump(): void { this.setState(this.state + this.props.step); }
  render(): i32 {
    console.log('render', this.props.label, this.state);
    return <View className="p-2"><Text>{this.props.label}: {this.state}</Text></View>;
  }
}

class App extends Component<{}, i32> {
  render(): i32 {
    return <View className="flex-col gap-2"><Counter label="clicks" step={2} /><Counter label="other" step={5} /></View>;
  }
}

render(<App />);
let ticks = 0;
setInterval(() => {
  ticks++;
  if (ticks === 2 && counter !== null) counter.bump();
  if (ticks === 4 && counter !== null) counter.bump();
}, 30);
