import {expect, test, beforeAll} from 'bun:test';

// Test credentials (cleaned up immediately after the round-trip test).
const TEST_SERVICE = 'com.acme.bun-security-scanner.test';
const TEST_ACCOUNT = 'backend-detection-check';
const TEST_VALUE = 'temporary-test-value-12345';

beforeAll(() => {
	if (typeof Bun.secrets === 'undefined') {
		throw new Error(
			'Bun.secrets API is not available. Upgrade Bun or run a version that supports it.',
		);
	}
});

test('Bun.secrets exposes the active OS credential backend', async () => {
	const platform = process.platform;
	console.log(`Detected process.platform: ${platform}`);

	let getError: Error | null = null;
	let result: string | null = null;

	// Probe a non-existent secret to see how the OS credential store responds.
	try {
		result = await Bun.secrets.get({service: TEST_SERVICE, name: TEST_ACCOUNT});
	} catch (err) {
		getError = err instanceof Error ? err : new Error(String(err));
	}

	let inferredBackend: string;

	if (platform === 'darwin') {
		if (getError) {
			console.error(`macOS: unexpected Keychain error: ${getError.message}`);
			inferredBackend = 'Keychain (error)';
		} else {
			console.log(
				`macOS: Keychain responded. Value: ${result === null ? 'null' : 'unexpected value'}`,
			);
			inferredBackend = 'Keychain (macOS)';
		}
	} else if (platform === 'win32') {
		if (getError) {
			console.error(`Windows: Credential Manager error: ${getError.message}`);
			inferredBackend = 'Windows Credential Manager (error)';
		} else {
			console.log(
				`Windows: Credential Manager responded. Value: ${result === null ? 'null' : 'unexpected value'}`,
			);
			inferredBackend = 'Windows Credential Manager';
		}
	} else if (platform === 'linux') {
		if (getError) {
			console.warn(`Linux: libsecret error (likely no secret service daemon): ${getError.message}`);
			inferredBackend = 'libsecret (Linux) - no daemon available';
		} else {
			console.log(
				`Linux: libsecret responded. Value: ${result === null ? 'null' : 'unexpected value'}`,
			);
			inferredBackend = 'libsecret (Linux)';
		}
	} else {
		inferredBackend = `Unknown platform: ${platform}`;
	}

	console.log(`Inferred backend: ${inferredBackend}`);
	// This test is purely observational; it does not assert failure.
	expect(inferredBackend).not.toMatch(/^Unknown/);
});

// Optional round-trip test (only runs when the backend is actually working).
test('completes a set -> get -> delete cycle when the backend is available', async () => {
	let storeAvailable = true;

	try {
		await Bun.secrets.get({service: TEST_SERVICE, name: TEST_ACCOUNT});
	} catch (err) {
		if (process.platform === 'linux') {
			console.warn('Skipping round-trip test: secret service seems unavailable.');
			storeAvailable = false;
		} else {
			throw err;
		}
	}

	if (!storeAvailable) return;

	// Clean up any leftover test data.
	await Bun.secrets.delete({service: TEST_SERVICE, name: TEST_ACCOUNT}).catch(() => {});

	await Bun.secrets.set({service: TEST_SERVICE, name: TEST_ACCOUNT, value: TEST_VALUE});
	console.log('Test secret stored.');

	const retrieved = await Bun.secrets.get({service: TEST_SERVICE, name: TEST_ACCOUNT});
	expect(retrieved).toBe(TEST_VALUE);
	console.log('Test secret retrieved correctly.');

	const deleted = await Bun.secrets.delete({service: TEST_SERVICE, name: TEST_ACCOUNT});
	expect(deleted).toBe(true);
	console.log('Test secret deleted.');

	const afterDelete = await Bun.secrets.get({service: TEST_SERVICE, name: TEST_ACCOUNT});
	expect(afterDelete).toBeNull();
});
