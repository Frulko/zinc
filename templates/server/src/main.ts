import { serve, Request, Reply } from 'zinc:net';
import * as telemetry from 'zinc:telemetry';

let hits = 0;
telemetry.expose('hits', () => hits);
serve(3000, (req: Request): Reply => {
  hits++;
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ path: req.path, hits }) };
});
console.log('listening on http://localhost:3000');
