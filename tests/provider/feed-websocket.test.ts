import {expect, test} from 'bun:test';
import {loadWebSocketFeed} from '../../src/provider/feed-websocket.ts';

test('loadWebSocketFeed receives JSON threat feed', async () => {
	const payload = {
		rules: [
			{
				package: 'ws-pkg',
				range: '1.0.0',
				url: null,
				description: 'WebSocket threat',
				categories: ['malware'],
			},
		],
	};

	const server = Bun.serve({
		port: 0,
		fetch(req, srv) {
			if (srv.upgrade(req)) return undefined;
			return new Response('ok');
		},
		websocket: {
			message() {},
			open(ws) {
				ws.send(JSON.stringify(payload));
				ws.close();
			},
		},
	});

	const feed = await loadWebSocketFeed(`ws://localhost:${server.port}`, {timeoutMs: 5000});
	expect(feed.rules[0]?.package).toBe('ws-pkg');
	server.stop(true);
});
