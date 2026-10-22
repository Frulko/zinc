# A page

A kit's Button is a component with its own look: it stays as it is.

```tsx
import { Button } from 'zinc:ui/kit';
const a = <Button variant="outline">Save</Button>;
```

The host field does not:

```jsx
<Input placeholder="Name" />
```

Prose with `<Button>` inline stays.
