export class Task {
  id: string;
  title: string;
  completed: boolean = false;

  constructor(id: string, title: string) {
    this.id = id;
    this.title = title;
  }
}

export class TodoList {
  id: string;
  title: string;
  theme: string = 'heat';
  tasks: Task[] = [];

  constructor(id: string, title: string) {
    this.id = id;
    this.title = title;
  }
}

export class Document {
  version: i32 = 1;
  nextId: i32 = 100;
  activeList: string = 'personal';
  lists: TodoList[] = [];
}

export function initialDocument(): Document {
  const document = new Document();
  const personal = new TodoList('personal', 'Personal List');
  const instructions = [
    'Type anywhere to create items',
    'Press space to complete tasks',
    'Right-click tasks to complete',
    'Left-click tasks to edit',
    'Hold and drag to re-order items',
    'Swipe to the left to delete items',
    'Pinch vertically to close lists',
    'Pull down to create items',
    'Pull up to clear completed',
  ];
  for (let i = 0; i < instructions.length; i++) {
    personal.tasks.push(new Task('intro-' + i.toString(), instructions[i]));
  }
  document.lists.push(personal);

  const groceries = new TodoList('groceries', 'Grocery List');
  const foods = ['Cinnamon Toast Crunch', 'Cilantro', 'Oranges', 'Chicken Strips', 'Sriracha sauce', 'Mushrooms', 'Jalapeños', 'Broccoli', 'Onion', 'Seasoning salt', 'Grapefruit', 'Pho bowls', 'Taco shells', 'Frozen pizza'];
  for (let i = 0; i < foods.length; i++) groceries.tasks.push(new Task('food-' + i.toString(), foods[i]));
  const waffles = new Task('waffles', 'Waffles');
  waffles.completed = true;
  groceries.tasks.push(waffles);
  document.lists.push(groceries);
  document.lists.push(new TodoList('movies', 'Movies to watch'));
  document.lists.push(new TodoList('weekend', 'Weekend plans'));
  document.lists.push(new TodoList('things', 'Things to buy'));
  document.lists.push(new TodoList('ideas', 'Misc. ideas'));
  return document;
}

/** Validate saved data before constructing the app's typed objects. */
export function readDocument(text: string): Document {
  const saved = JSON.parse(text);
  if (saved.version !== 1 || !Array.isArray(saved.lists) || typeof saved.activeList !== 'string' ||
      typeof saved.nextId !== 'number' || !Number.isInteger(Number(saved.nextId)) || Number(saved.nextId) < 100) {
    throw new Error('Invalid Clear data; the saved document has been left untouched');
  }
  const document = new Document();
  document.nextId = Number(saved.nextId) as i32;
  document.activeList = String(saved.activeList);
  const identifiers: string[] = [];
  for (const raw of saved.lists) {
    if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.theme !== 'string' || !Array.isArray(raw.tasks)) {
      throw new Error('Invalid saved Clear list');
    }
    const list = new TodoList(String(raw.id), String(raw.title));
    list.theme = String(raw.theme);
    if (list.id === '' || identifiers.indexOf(list.id) >= 0) throw new Error('Duplicate Clear list id');
    identifiers.push(list.id);
    for (const item of raw.tasks) {
      if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.completed !== 'boolean') {
        throw new Error('Invalid saved Clear task');
      }
      const task = new Task(String(item.id), String(item.title));
      task.completed = item.completed === true;
      if (task.id === '' || identifiers.indexOf(task.id) >= 0) throw new Error('Duplicate Clear task id');
      identifiers.push(task.id);
      list.tasks.push(task);
    }
    document.lists.push(list);
  }
  if (!document.lists.some((list: TodoList) => list.id === document.activeList)) document.activeList = '';
  return document;
}
