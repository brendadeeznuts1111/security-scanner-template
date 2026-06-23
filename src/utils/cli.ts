import {isMainModule} from './runtime.ts';

/** Narrow `util.parseArgs` string options (boolean flags arrive as `true`). */
export function cliString(value: string | boolean | undefined): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/** Narrow `util.parseArgs` boolean options. */
export function cliBoolean(value: string | boolean | undefined): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

/**
 * Run a CLI entrypoint only when the module is executed directly (Bun.main).
 */
export async function runCliIfMain(
	main: () => void | Promise<void>,
	modulePath: string = import.meta.path,
): Promise<void> {
	if (!isMainModule(modulePath)) {
		return;
	}

	try {
		await main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
