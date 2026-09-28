// An Inferno-style app (class components, setState, linkEvent, keyed list) compiled natively by Zinc.
import { Component, linkEvent, VirtualList } from 'inferno';

interface Todo { id: i32; text: string; done: boolean }
interface ItemProps { todo: Todo; onToggle: (id: i32) => void }

class Item extends Component<ItemProps, i32> {
  render(): i32 {
    const t = this.props.todo;
    return <view className={t.done ? 'flex-row gap-2 p-2 rounded-lg bg-emerald-100' : 'flex-row gap-2 p-2 rounded-lg bg-white'}
                 onClick={linkEvent(t.id, this.props.onToggle)}>
      <text className={t.done ? 'text-emerald-700' : 'text-slate-800'}>{t.done ? '✓' : '○'} {t.text}</text>
    </view>;
  }
}

interface AppState { todos: Todo[]; next: i32 }
interface AppProps { title?: string }
export class App extends Component<AppProps, AppState> {
  constructor(props: AppProps) {
    super(props);
    this.state = { todos: [{ id: 1, text: 'Compile Inferno to C++', done: true }, { id: 2, text: 'Run without a JS engine', done: false }], next: 3 };
  }
  toggle(id: i32): void {
    const todos = this.state.todos.map((t: Todo) => t.id === id ? { id: t.id, text: t.text, done: !t.done } : t);
    this.setState({ todos: todos, next: this.state.next });
  }
  add(n: i32): void {
    const todos = this.state.todos.slice();
    for (let k = 0; k < n; k++) todos.push({ id: this.state.next + k, text: `Task ${this.state.next + k}`, done: false });
    this.setState({ todos: todos, next: this.state.next + n });
  }
  render(): i32 {
    const left = this.state.todos.filter((t: Todo) => !t.done).length;
    return <view className="flex-col gap-2 p-4 h-full bg-slate-100">
      <text className="text-2xl font-bold text-slate-900">{this.props.title ?? "Inferno on Zinc"}</text>
      <text className="text-sm text-slate-500">{left} left of {this.state.todos.length} · click to toggle, scroll or drag the list</text>
      <VirtualList count={this.state.todos.length} itemHeight={46} className="grow rounded-lg">
        {(i: i32) => <view className="pb-2"><Item todo={this.state.todos[i]} onToggle={(id: i32) => this.toggle(id)} /></view>}
      </VirtualList>
      <view className="flex-row gap-2">
        <view className="px-3 py-2 rounded-lg bg-blue-600" onClick={() => this.add(1)}>
          <text className="text-white font-bold">Add task</text>
        </view>
        <view className="px-3 py-2 rounded-lg bg-slate-700" onClick={() => this.add(1000)}>
          <text className="text-white font-bold">+1000</text>
        </view>
      </view>
    </view>;
  }
}

