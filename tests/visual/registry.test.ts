import {expect, test} from 'bun:test';
import {Registry} from '../../src/registry/index.ts';

test('Registry exposes visual helpers', () => {
	const registry = new Registry();
	expect(registry.visual.thumb).toBeDefined();
	expect(registry.visual.placeholder).toBeDefined();
	expect(registry.visual.qr).toBeDefined();
	expect(registry.visual.reportImage).toBeDefined();
	expect(registry.visual.audit).toBeDefined();
	expect(registry.visual.metadata).toBeDefined();
	expect(registry.visual.sanitize).toBeDefined();
	expect(registry.visual.convert).toBeDefined();
	expect(registry.visual.pipeline).toBeDefined();
	expect(typeof registry.visual.isAvailable).toBe('function');
});
