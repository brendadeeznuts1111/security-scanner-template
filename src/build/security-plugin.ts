import {scanSource} from '../scan/transpiler.ts';

export interface SecurityPluginOptions {
	/** Log findings to stderr during build (default: true). */
	log?: boolean;
	/** Treat fatal findings as build errors (default: false). */
	failOnFatal?: boolean;
}

/**
 * Bun.plugin hook that scans TypeScript/JavaScript modules at build time.
 */
export function createSecurityBuildPlugin(options: SecurityPluginOptions = {}) {
	const log = options.log !== false;
	const failOnFatal = options.failOnFatal === true;

	return {
		name: 'security-scanner-build-plugin',
		setup(build: {
			onLoad: (
				args: {filter: RegExp},
				callback: (args: {
					path: string;
				}) => Promise<{contents: string; loader: string} | null> | {contents: string; loader: string} | null,
			) => void;
		}) {
			build.onLoad({filter: /\.(tsx?|jsx?|mjs|cjs)$/}, async args => {
				const file = Bun.file(args.path);
				if (!(await file.exists()) || file.size === 0) return null;

				const text = await file.text();
				const loader = args.path.endsWith('.tsx')
					? 'tsx'
					: args.path.endsWith('.ts')
						? 'ts'
						: 'js';

				const findings = scanSource(text, {loader});
				const fatal = findings.filter(f => f.severity === 'fatal');

				if (log && findings.length > 0) {
					for (const finding of findings) {
						console.error(
							`[security-plugin] ${args.path}:${finding.line ?? '?'} ${finding.severity} ${finding.description}`,
						);
					}
				}

				if (failOnFatal && fatal.length > 0) {
					throw new Error(
						`[security-plugin] ${fatal.length} fatal finding(s) in ${args.path}`,
					);
				}

				return {contents: text, loader};
			});
		},
	};
}