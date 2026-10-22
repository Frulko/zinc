# A page

A kit's Button is a component with its own look: it stays as it is.

```tsx
import { Button } from 'zinc:ui/kit';
const a = <Button variant="outline">Save</Button>;
```

The host field does not:

```jsx
<Input className="bg-slate-800 border border-slate-600 rounded-md text-[14px] px-2 py-1.5 text-slate-100" placeholder="Name" />
```

Prose with `<Button>` inline stays.
