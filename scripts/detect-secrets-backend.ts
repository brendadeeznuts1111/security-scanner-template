import {detectSecretsBackend} from '../src/secrets-backend.ts';

/**
 * Detects the active OS credential backend for Bun.secrets.
 *
 * Prints a single JSON line to stdout:
 *   {"platform":"darwin","backend":"keychain","available":true}
 *
 * Exits 0 if the backend responds to a harmless probe, 1 otherwise.
 */

async function main() {
	const result = await detectSecretsBackend();
	console.log(JSON.stringify(result));
	process.exit(result.available ? 0 : 1);
}

main();
