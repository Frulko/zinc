// One row of the list: a checkbox and the task, as an Inferno class component. Clicking anywhere on the row
// toggles it; linkEvent binds the handler to the task id without a closure per render.
import { Component, linkEvent } from 'inferno';
import { Todo } from '../todos';

export interface TodoItemProps {
  todo: Todo;
  onToggle: (id: i32) => void;
}

const ROW = 'flex-row items-center gap-3 px-3 h-10 rounded-md bg-white focus:bg-zinc-100 active:bg-zinc-100';
const BOX_DONE = 'w-4 h-4 rounded items-center justify-center bg-zinc-900';
const BOX_OPEN = 'w-4 h-4 rounded border border-zinc-300 bg-white';

export class TodoItem extends Component<TodoItemProps, i32> {
  render(): i32 {
    const todo = this.props.todo;
    return <View className={ROW} onClick={linkEvent(todo.id, this.props.onToggle)}>
      <View className={todo.done ? BOX_DONE : BOX_OPEN}>
        <Text className="text-xs font-bold text-white">{todo.done ? '✓' : ''}</Text>
      </View>
      <Text className={todo.done ? 'text-sm text-zinc-400' : 'text-sm text-zinc-900'}>{todo.text}</Text>
    </View>;
  }
}
