import {expect, test} from 'bun:test';
import {cloneStructured, deserializeStructured, serializeStructured} from '../../src/utils/jsc.ts';

test('serializeStructured and deserializeStructured round-trip', () => {
	const value = {domain: 'com.example.app', nested: {enabled: true}};
	const buffer = serializeStructured(value);
	expect(buffer.byteLength).toBeGreaterThan(0);
	expect(deserializeStructured(buffer)).toEqual(value);
});

test('cloneStructured deep-clones without sharing references', () => {
	const original = {items: [{name: 'csrf-secret'}]};
	const cloned = cloneStructured(original);
	cloned.items[0]!.name = 'rotated';

	expect(original.items[0]!.name).toBe('csrf-secret');
	expect(cloned.items[0]!.name).toBe('rotated');
});
