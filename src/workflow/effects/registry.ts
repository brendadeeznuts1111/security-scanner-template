/**
 * Effect registry — manages built-in and user-defined workflow effects.
 *
 * Effects run in parallel after each workflow loop. Each effect can declare a
 * `condition` so it only executes when the scan state warrants it.
 */
import path from 'path';
import {AlertEffect, FixEffect, LogEffect, ReportEffect} from './builtins/index.ts';
import type {EffectConfig, EffectContext, EffectPlugin} from './plugin.ts';

export class EffectRegistry {
	private plugins = new Map<string, EffectPlugin>();
	private configs = new Map<string, EffectConfig>();

	constructor() {
		this.register(new LogEffect());
		this.register(new AlertEffect());
		this.register(new FixEffect());
		this.register(new ReportEffect());
	}

	register(plugin: EffectPlugin): void {
		this.plugins.set(plugin.id, plugin);
	}

	configure(id: string, config: EffectConfig): void {
		this.configs.set(id, config);
	}

	getConfig(id: string): EffectConfig | undefined {
		return this.configs.get(id);
	}

	getPlugin(id: string): EffectPlugin | undefined {
		return this.plugins.get(id);
	}

	configuredIds(): string[] {
		return [...this.configs.keys()];
	}

	registeredIds(): string[] {
		return [...this.plugins.keys()];
	}

	async runAll(ctx: EffectContext): Promise<void> {
		const promises: Promise<void>[] = [];
		for (const [id, plugin] of this.plugins) {
			const config = this.configs.get(id);
			if (config && !config.enabled) {
				continue;
			}
			if (plugin.condition && !plugin.condition(ctx)) {
				continue;
			}
			const pluginCtx: EffectContext = {
				...ctx,
				options: config?.params ?? {},
			};
			promises.push(plugin.run(pluginCtx));
		}
		await Promise.all(promises);
	}

	/**
	 * Load user-defined effect plugins from a directory.
	 *
	 * Every `.ts` file is imported; the default export is registered if it
	 * has a valid `id` and `run` method.
	 */
	async loadFromDirectory(dir: string): Promise<string[]> {
		const loaded: string[] = [];
		const glob = new Bun.Glob('*.ts');
		for await (const file of glob.scan({cwd: dir, absolute: true})) {
			const base = path.basename(file);
			if (base.endsWith('.test.ts') || base === 'index.ts') {
				continue;
			}
			const mod = (await import(pathToFileURL(file).href)) as {
				default?: unknown;
			};
			const plugin = mod.default;
			if (
				plugin &&
				typeof plugin === 'object' &&
				'id' in plugin &&
				typeof plugin.id === 'string' &&
				'run' in plugin &&
				typeof plugin.run === 'function'
			) {
				const effect = plugin as EffectPlugin;
				if (this.plugins.has(effect.id)) {
					console.error(`[workflow] skipping duplicate effect id "${effect.id}" in ${base}`);
					continue;
				}
				this.register(effect);
				this.configure(effect.id, {enabled: true});
				loaded.push(effect.id);
			}
		}
		return loaded;
	}
}

function pathToFileURL(filePath: string): URL {
	return pathToFileURLImpl(filePath);
}

function pathToFileURLImpl(filePath: string): URL {
	// Bun supports direct file-path imports, but file:// URLs are safest for
	// cross-platform dynamic imports.
	return new URL(`file://${filePath.replaceAll('\\', '/')}`);
}
