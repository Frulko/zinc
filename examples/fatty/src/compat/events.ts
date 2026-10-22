// The event subset used by Fatty. Keeping target while bubbling is essential to its score/life logic.
export class Event {
  static readonly ADDED_TO_STAGE = 'addedToStage';
  static readonly ENTER_FRAME = 'enterFrame';
  static readonly TRIGGERED = 'triggered';
  static readonly COMPLETE = 'complete';
  target: unknown = null;
  currentTarget: unknown = null;
  stopped = false;
  constructor(public type: string, public bubbles = false, public data: unknown = null) {}
  stopPropagation(): void { this.stopped = true; }
}
export class EnterFrameEvent extends Event {
  constructor(public passedTime = 0) { super(Event.ENTER_FRAME); }
}
export class Touch { constructor(public phase: string) {} }
export class TouchPhase { static readonly BEGAN = 'began'; }
export class TouchEvent extends Event {
  static readonly TOUCH = 'touch';
  private touch = new Touch(TouchPhase.BEGAN);
  constructor() { super(TouchEvent.TOUCH, true); }
  getTouch(target: unknown, phase: string): Touch | null {
    return phase === this.touch.phase ? this.touch : null;
  }
}
// A method signature keeps subclasses' typed event handlers assignable, as in Starling.
type Callback = { handle(event: Event): void }['handle'];
class Listener {
  active = true;
  constructor(public type: string, public callback: Callback) {}
}
export class EventDispatcher {
  private listeners: Listener[] = [];
  get eventParent(): EventDispatcher | null { return null; }
  get eventTarget(): unknown { return this; }
  addEventListener(type: string, callback: Callback): void {
    const existing = this.listeners.find(l => l.type === type && l.callback === callback);
    if (existing) existing.active = true;
    else this.listeners.push(new Listener(type, callback));
  }
  removeEventListener(type: string, callback: Callback): void {
    const listener = this.listeners.find(l => l.type === type && l.callback === callback);
    if (listener) listener.active = false;
  }
  hasEventListener(type: string): boolean {
    for (const listener of this.listeners) if (listener.active && listener.type === type) return true;
    return false;
  }
  dispatchEvent(event: Event): void {
    event.target = this.eventTarget;
    event.stopped = false;
    let node: EventDispatcher | null = this;
    while (node) {
      event.currentTarget = node.eventTarget;
      const count = node.listeners.length;
      for (let i = 0; i < count; i++) {
        const listener = node.listeners[i];
        if (listener.active && listener.type === event.type) listener.callback(event);
      }
      if (!event.bubbles || event.stopped) break;
      node = node.eventParent;
    }
  }
}
