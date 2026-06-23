import {expect, test} from 'bun:test';
import {formatTable, formatValue} from '../../src/utils/inspect.ts';

test('formatTable renders rows and columns', () => {
	const table = formatTable([{name: 'csrf-secret', status: 'present'}], ['name', 'status'], {
		colors: false,
	});
	expect(table).toContain('csrf-secret');
	expect(table).toContain('present');
});

test('formatValue stringifies objects', () => {
	const rendered = formatValue({ok: true}, {colors: false});
	expect(rendered).toContain('ok');
});
