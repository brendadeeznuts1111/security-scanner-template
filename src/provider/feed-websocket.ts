import {parseJSONLFeed} from './feed-jsonl.ts';
import type {LoadedFeed} from './feed.ts';
import {normalizeThreatFeed} from './validator.ts';

export interface WebSocketFeedOptions {
	timeoutMs?: number;
}

function parseWebSocketPayload(chunks: string[]): LoadedFeed | null {
	const payload = chunks.join('\n').trim();
	if (payload.length === 0) {
		return null;
	}

	try {
		if (payload.startsWith('{') || payload.startsWith('[')) {
			return normalizeThreatFeed(JSON.parse(payload));
		}
		return parseJSONLFeed(payload);
	} catch {
		return null;
	}
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
		let settled = false;
		const socket = new WebSocket(url);

		const finish = (handler: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			handler();
		};

		const timeout = setTimeout(() => {
			socket.close();
			finish(() => {
				reject(new Error(`WebSocket feed timed out after ${timeoutMs}ms`));
			});
		}, timeoutMs);

		const tryResolve = () => {
			const feed = parseWebSocketPayload(chunks);
			if (!feed) return false;
			socket.close();
			finish(() => resolve(feed));
			return true;
		};

		socket.addEventListener('message', event => {
			const text = typeof event.data === 'string' ? event.data : String(event.data);
			chunks.push(text);
			tryResolve();
		});

		socket.addEventListener('error', () => {
			finish(() => {
				reject(new Error(`WebSocket feed connection failed: ${url}`));
			});
		});

		socket.addEventListener('close', () => {
			finish(() => {
				const feed = parseWebSocketPayload(chunks);
				if (!feed) {
					reject(new Error('WebSocket feed closed without data'));
					return;
				}
				resolve(feed);
			});
		});
	});
}
