// The to-do app: an Inferno class component holding the list in its state. The list is virtual: with
// thousands of tasks only the rows in view exist as nodes. zinc:ui/kit components work here too (React model).
import { Component, VirtualList } from 'inferno';
import { Button, Progress, heading, mutedText } from 'zinc:ui/kit';
import { Todo, INITIAL_TODOS, toggled, withNewTasks, remaining } from './todos';
import { TodoItem } from './components/todo-item';

const ROW_HEIGHT: i32 = 44;   // 40 px row + 4 px gap

interface AppState { todos: Todo[]; nextId: i32 }
interface AppProps { title?: string }

export class App extends Component<AppProps, AppState> {
  constructor(props: AppProps) {
    super(props);
    this.state = { todos: INITIAL_TODOS, nextId: 3 };
  }

  toggle(id: i32): void {
    this.setState({ todos: toggled(this.state.todos, id), nextId: this.state.nextId });
  }

  add(count: i32): void {
    const todos = withNewTasks(this.state.todos, this.state.nextId, count);
    this.setState({ todos: todos, nextId: this.state.nextId + count });
  }

  render(): i32 {
    const total = this.state.todos.length;
    const left = remaining(this.state.todos);
    const donePercent = total === 0 ? 0 : (total - left) * 100 / total;
    return <View className="flex-col gap-4 p-5 md:p-10 h-full bg-zinc-50">
      <View className="flex-col gap-1">
        <Text className={heading(2)}>{this.props.title ?? 'Inferno on Zinc'}</Text>
        <Text className={mutedText()}>{left} left of {total} · click a task to toggle it</Text>
      </View>
      <Progress value={() => donePercent} />
      <VirtualList count={total} itemHeight={ROW_HEIGHT} className="grow p-1 rounded-xl border border-zinc-200 bg-white lg:mx-24">
        {(i: i32) => <View className="pb-1"><TodoItem todo={this.state.todos[i]} onToggle={(id: i32) => this.toggle(id)} /></View>}
      </VirtualList>
      <View className="flex-row gap-2">
        <Button label="Add task" onClick={() => this.add(1)} />
        <Button label="Add 1000" variant="outline" onClick={() => this.add(1000)} />
      </View>
    </View>;
  }
}
