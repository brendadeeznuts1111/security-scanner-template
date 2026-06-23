import {expect, test} from 'bun:test';
import {createAsyncDebouncer} from '../../src/utils/debounce.ts';

test('createAsyncDebouncer coalesces rapid triggers', async () => {
	let count = 0;
	const debounced = createAsyncDebouncer(() => {
		count += 1;
	}, 30);

	debounced();
	debounced();
	debounced();

	await Bun.sleep(60);
	expect(count).toBe(1);
});