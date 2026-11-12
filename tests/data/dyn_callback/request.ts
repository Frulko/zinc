import { Request, fetch } from 'zinc:web/fetch';
const request = new Request('https://example.com/path', { method: 'POST', body: 'body' });
const clone = request.clone();
console.log(clone.url, clone.method, request.bodyUsed, clone.bodyUsed);
console.log(await request.text(), await clone.text());
const response = await fetch('data:text/plain,local');
console.log(response.status, await response.text());
