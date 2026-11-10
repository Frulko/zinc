// One event owner for all System feature modules. Records are never reused.
enum SubscriptionState { Registered, Disposed }
function ignoreEvent(args:string[]):void {}
class Subscription {
  state: SubscriptionState = SubscriptionState.Registered;
  type: string; handler: (args: string[]) => void;
  constructor(type: string, handler: (args: string[]) => void) { this.type = type; this.handler = handler; }
  transition(next: SubscriptionState): boolean {
    if (this.state === SubscriptionState.Disposed) return false;
    this.state = next; return true;
  }
}
export class EventSubscriptions {
  private records: Subscription[] = [];
  on(type: string, handler: (args: string[]) => void): () => void {
    const record = new Subscription(type, handler);
    this.records.push(record);
    return (): void => {
      if (!record.transition(SubscriptionState.Disposed)) return;
      record.handler=ignoreEvent;
      const index = this.records.indexOf(record);
      if (index >= 0) this.records.splice(index, 1);
    };
  }
  dispatch(type: string, args: string[]): void {
    const snapshot = this.records.slice();
    for (const record of snapshot) {
      if (record.state === SubscriptionState.Registered && record.type === type) record.handler(args);
    }
  }
}
