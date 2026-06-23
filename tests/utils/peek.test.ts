/**
 * @see https://bun.com/docs/runtime/utils#bun-peek
 */
import {expect, test} from 'bun:test';
import {BUN_PEEK_DOCS_URL, isPeekAvailable, peekStatus, peekValue} from '../../src/utils/peek.ts';

test('peek reads fulfilled promises without await', () => {
	const promise = Promise.resolve(true);
	expect(peekValue(promise)).toBe(true);
	expect(peekValue(promise)).toBe(true);
});

test('peek passes through non-promise values', () => {
	expect(peekValue(42)).toBe(42);
});

test('peek returns pending promise when not settled', () => {
	const pending = new Promise(() => {});
	expect(peekValue(pending)).toBe(pending);
});

test('peek returns rejected error without marking handled', () => {
	const rejected = Promise.reject(new Error('Successfully tested promise rejection'));
	const error = peekValue(rejected);
	expect((error as unknown as Error).message).toBe('Successfully tested promise rejection');
	rejected.catch(() => {});
});

test('peek.status reports fulfilled pending and rejected', () => {
	expect(peekStatus(Promise.resolve(true))).toBe('fulfilled');
	expect(peekStatus(new Promise(() => {}))).toBe('pending');
	const rejected = Promise.reject(new Error('oh nooo'));
	rejected.catch(() => {});
	expect(peekStatus(rejected)).toBe('rejected');
});

test('isPeekAvailable reflects Bun.peek presence', () => {
	expect(isPeekAvailable()).toBe(typeof Bun.peek === 'function');
});

test('docs URL points at runtime peek reference', () => {
	expect(BUN_PEEK_DOCS_URL).toContain('bun-peek');
});
