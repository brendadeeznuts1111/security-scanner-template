import {expect, test} from 'bun:test';
import {resolveFeedProtocol} from '../../src/net/protocol.ts';

test('resolveFeedProtocol prefers explicit config', () => {
	expect(resolveFeedProtocol('http3', {})).toBe('http3');
	expect(resolveFeedProtocol('http2', {})).toBe('http2');
});

test('resolveFeedProtocol reads FEED_FETCH_PROTOCOL env', () => {
	expect(resolveFeedProtocol(undefined, {FEED_FETCH_PROTOCOL: 'http2'})).toBe('http2');
});

test('resolveFeedProtocol enables http3 via experimental flag', () => {
	expect(resolveFeedProtocol(undefined, {BUN_FEATURE_FLAG_EXPERIMENTAL_HTTP3_CLIENT: '1'})).toBe(
		'http3',
	);
});

test('resolveFeedProtocol returns undefined when unset', () => {
	expect(resolveFeedProtocol(undefined, {})).toBeUndefined();
});
