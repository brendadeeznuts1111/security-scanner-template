import {createVaultDomain, VaultDomain, type VaultStatusEntry} from '../domains/vault.ts';
import {DOMAIN_SECRETS, listDomains, SCANNER_DOMAIN} from '../domains/registry.ts';
import {isOsCredentialStoreAvailable} from '../secrets-backend.ts';

function colorize(hex: string, text: string): string {
	const code = Bun.color(hex, 'ansi') ?? '';
	return code ? `${code}${text}\x1b[0m` : text;
}

const COLOR_OK = '#33dd66';
const COLOR_WARN = '#ffcc33';
const COLOR_ERROR = '#ff4444';
const COLOR_INFO = '#33aaff';

export interface VaultCliOptions {
	domain?: string;
	name?: string;
	value?: string;
	json?: boolean;
}

function resolveDomain(options: VaultCliOptions): string {
	if (options.domain) return options.domain;
	return SCANNER_DOMAIN;
}

function resolveDomainVault(options: VaultCliOptions): VaultDomain {
	return createVaultDomain(resolveDomain(options));
}

function requireName(options: VaultCliOptions): string {
	if (!options.name || options.name.length === 0) {
		console.error(colorize(COLOR_ERROR, '[vault] --name is required'));
		process.exit(1);
	}
	return options.name;
}

async function readSecretValue(options: VaultCliOptions, promptText: string): Promise<string> {
	if (options.value && options.value.length > 0) {
		return options.value;
	}

	if (typeof process.stdout.isTTY === 'boolean' && process.stdout.isTTY) {
		const value = prompt(promptText);
		if (value && value.length > 0) return value;
	}

	// Non-TTY: read from stdin so `echo $TOKEN | bun run ... --set` works.
	console.error(
		colorize(
			COLOR_INFO,
			`${promptText} (paste, then press Enter on a blank line or Ctrl+D to finish):`,
		),
	);
	let stdinValue = '';
	try {
		for await (const line of console) {
			if (line === '') break;
			stdinValue += line.trim();
		}
	} catch {
		/* console iteration error; fall through */
	}

	if (stdinValue.length === 0) {
		console.error(colorize(COLOR_ERROR, '[vault] no value provided, aborting'));
		process.exit(1);
	}

	return stdinValue;
}

export async function runVaultStatus(options: VaultCliOptions = {}): Promise<void> {
	const domain = resolveDomain(options);
	const vault = createVaultDomain(domain);

	const available = await isOsCredentialStoreAvailable();
	if (!available) {
		console.error(colorize(COLOR_ERROR, '[vault] OS credential store is not available'));
		process.exit(1);
	}

	const status = await vault.status();

	if (options.json) {
		console.log(JSON.stringify({domain, status}, null, 2));
		return;
	}

	console.error(`[vault] secrets for ${domain}`);
	console.error(
		Bun.inspect.table(
			status.map(s => ({
				name: s.name,
				status: s.exists ? colorize(COLOR_OK, 'present') : colorize(COLOR_WARN, 'missing'),
				required: s.required ? 'yes' : 'no',
			})),
			['name', 'status', 'required'],
			{colors: true},
		),
	);
}

export async function runVaultSet(options: VaultCliOptions = {}): Promise<void> {
	const domain = resolveDomain(options);
	const name = requireName(options);
	const vault = createVaultDomain(domain);

	const available = await isOsCredentialStoreAvailable();
	if (!available) {
		console.error(colorize(COLOR_ERROR, '[vault] OS credential store is not available'));
		process.exit(1);
	}

	const value = await readSecretValue(options, `Enter value for ${domain}/${name}`);

	try {
		await vault.set(name, value);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			colorize(COLOR_ERROR, `[vault] could not store secret (${domain}/${name}): ${message}`),
		);
		process.exit(1);
	}

	console.error(colorize(COLOR_OK, `[vault] secret stored (${domain}/${name})`));
}

export async function runVaultGet(options: VaultCliOptions = {}): Promise<void> {
	const domain = resolveDomain(options);
	const name = requireName(options);
	const vault = createVaultDomain(domain);

	const available = await isOsCredentialStoreAvailable();
	if (!available) {
		console.error(colorize(COLOR_ERROR, '[vault] OS credential store is not available'));
		process.exit(1);
	}

	let value: string;
	try {
		value = await vault.get(name);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			colorize(COLOR_ERROR, `[vault] could not read secret (${domain}/${name}): ${message}`),
		);
		process.exit(1);
	}

	if (options.json) {
		console.log(JSON.stringify({domain, name, exists: value.length > 0}, null, 2));
		return;
	}

	console.log(value);
}

export async function runVaultDelete(options: VaultCliOptions = {}): Promise<void> {
	const domain = resolveDomain(options);
	const name = requireName(options);
	const vault = createVaultDomain(domain);

	const available = await isOsCredentialStoreAvailable();
	if (!available) {
		console.error(colorize(COLOR_ERROR, '[vault] OS credential store is not available'));
		process.exit(1);
	}

	let deleted: boolean;
	try {
		deleted = await vault.delete(name);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			colorize(COLOR_ERROR, `[vault] could not delete secret (${domain}/${name}): ${message}`),
		);
		process.exit(1);
	}

	if (deleted) {
		console.error(colorize(COLOR_OK, `[vault] secret removed (${domain}/${name})`));
	} else {
		console.error(colorize(COLOR_WARN, `[vault] no secret found for ${domain}/${name}`));
	}
}

export interface DoctorRow {
	domain: string;
	name: string;
	exists: boolean;
	required: boolean;
	winPersist?: string;
}

export async function runVaultDoctor(options: VaultCliOptions = {}): Promise<void> {
	const available = await isOsCredentialStoreAvailable();
	if (!available) {
		console.error(colorize(COLOR_ERROR, '[vault doctor] OS credential store is not available'));
		process.exit(1);
	}

	const rows: DoctorRow[] = [];
	for (const domain of listDomains()) {
		const vault = createVaultDomain(domain);
		const status = await vault.status();
		for (const entry of status) {
			rows.push({
				domain,
				name: entry.name,
				exists: entry.exists,
				required: entry.required,
				winPersist: process.platform === 'win32' ? 'ENTERPRISE' : undefined,
			});
		}
	}

	const missingRequired = rows.filter(r => r.required && !r.exists);
	const ok = missingRequired.length === 0;

	if (options.json) {
		console.log(JSON.stringify({ok, rows}, null, 2));
		process.exit(ok ? 0 : 1);
	}

	console.error(
		`[vault doctor] ${ok ? colorize(COLOR_OK, 'all required secrets present') : colorize(COLOR_ERROR, `${missingRequired.length} required secret(s) missing`)}`,
	);

	const headers =
		process.platform === 'win32'
			? ['domain', 'name', 'status', 'required', 'winPersist']
			: ['domain', 'name', 'status', 'required'];
	console.error(
		Bun.inspect.table(
			rows.map(r => ({
				domain: r.domain,
				name: r.name,
				status: r.exists ? colorize(COLOR_OK, 'present') : colorize(COLOR_WARN, 'missing'),
				required: r.required ? 'yes' : 'no',
				winPersist: r.winPersist ?? '',
			})),
			headers,
			{colors: true},
		),
	);

	process.exit(ok ? 0 : 1);
}
