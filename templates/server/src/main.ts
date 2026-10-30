import { serve, Request, Reply } from 'zinc:net';
import { env } from 'zinc:sys';
import * as telemetry from 'zinc:telemetry';

let hits = 0;
telemetry.expose('hits', () => hits);
const want = env('PORT') === '' ? 3000 : parseInt(env('PORT'));   // PORT=8080 zinc run: another port, PORT=0 a free one
const port = serve(want, (req: Request): Reply => {
  hits++;
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ path: req.path, hits }) };
});
console.log(`listening on http://localhost:${port}`);
