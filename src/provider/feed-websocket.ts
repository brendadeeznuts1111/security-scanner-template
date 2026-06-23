import {parseJSONLFeed} from './feed-jsonl.ts';
import type {LoadedFeed} from './feed.ts';
import {normalizeThreatFeed} from './validator.ts';

export interface WebSocketFeedOptions {
	timeoutMs?: number;
}

/**
 * Load a threat feed from a WebSocket endpoint.
 *
 * The server may send a single JSON document or JSONL chunks. The first complete
 * payload received before the timeout is normalized and returned.
 */
export async function loadWebSocketFeed(
	url: string,
	options: WebSocketFeedOptions = {},
): Promise<LoadedFeed> {
	const timeoutMs = options.timeoutMs ?? 10_000;

	return new Promise((resolve, reject) => {
		const chunks: string[] = [];
		const socket = new WebSocket(url);
		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error(`WebSocket feed timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		socket.addEventListener('message', event => {
			const text = typeof event.data === 'string' ? event.data : String(event.data);
			chunks.push(text);
		});

		socket.addEventListener('error', () => {
			clearTimeout(timeout);
			reject(new Error(`WebSocket feed connection failed: ${url}`));
		});

		socket.addEventListener('close', () => {
			clearTimeout(timeout);
			try {
				const payload = chunks.join('\n').trim();
				if (payload.length === 0) {
					reject(new Error('WebSocket feed closed without data'));
					return;
				}

				if (payload.startsWith('{') || payload.startsWith('[')) {
					resolve(normalizeThreatFeed(JSON.parse(payload)));
					return;
				}

				resolve(parseJSONLFeed(payload));
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	});
}
