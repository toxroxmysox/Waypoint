// #502 — production entry: the adapter-node handler behind fillTokenOrigin (see
// token-origin.mjs). Replaces `node build/index.js`; same PORT/HOST env.
import http from 'node:http';
import { handler } from '../build/handler.js';
import { fillTokenOrigin } from './token-origin.mjs';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

http
	.createServer((req, res) => {
		fillTokenOrigin(req);
		handler(req, res);
	})
	.listen(port, host, () => console.log(`Listening on http://${host}:${port}`));
