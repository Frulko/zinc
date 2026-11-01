import { serve, Request, Reply } from 'zinc:net';
import { utf8Encode } from 'zinc:sys';
// A request body holding two UTF-8 encoded surrogate halves side by side (a gzip does by chance) is joined into one character by any string:
// Request.rawBytes then carries the body's bytes. The server answers the length and the bytes it reads that way.
serve(18852, (req: Request): Reply => {
  const b = req.rawBytes ?? utf8Encode(req.rawBody ?? req.body);
  return { status: 200, body: b.length + ':' + b.join(','), contentType: 'text/plain' };
});
