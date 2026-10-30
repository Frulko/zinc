// Starts the server: the port from PORT (3000 by default), every request to the API.
import { serve, Request, Reply } from 'zinc:net';
import { env } from 'zinc:sys';
import { Store } from './store';
import { handle } from './api';

const want = env('PORT') === '' ? 3000 : parseInt(env('PORT'));
const store = new Store();
const port = serve(want, (req: Request): Reply => {   // the port it listens on (PORT=0: a free one)
  const r = handle(store, req);
  console.log(`${req.method} ${req.path} ${r.status}`);
  return r;
});
console.log(`{{name}} listening on http://localhost:${port}`);
