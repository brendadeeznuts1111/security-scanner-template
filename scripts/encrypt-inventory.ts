import {encryptInventory} from '../src/config/vault.ts';

async function main() {
	const args = process.argv.slice(2);
	const [domain] = args;

	if (!domain) {
		console.error('Usage: bun run scripts/encrypt-inventory.ts <domain>');
		console.error('Reads stdin as JSON5/JSON array of SecretEntry and writes encrypted envelope.');
		process.exit(1);
	}

	const masterKey = process.env.VAULT_MASTER_KEY;
	if (!masterKey) {
		console.error('VAULT_MASTER_KEY environment variable is required');
		process.exit(1);
	}

	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const input = Buffer.concat(chunks).toString('utf-8');
	const inventory = Bun.JSON5.parse(input) as unknown;
	if (!Array.isArray(inventory)) {
		console.error('Input must be a JSON array of secret entries');
		process.exit(1);
	}

	const envelope = await encryptInventory(inventory, masterKey);
	const outputPath = `.vault/${domain}.inventory.json5.enc`;
	await Bun.write(outputPath, JSON.stringify(envelope, null, 2));
	console.error(`Encrypted inventory written to ${outputPath}`);
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
