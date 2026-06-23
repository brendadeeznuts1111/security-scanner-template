/**
 * Example custom workflow effect plugin.
 * Copy to your effects directory and pass `--effects-dir <path>` to `bun sp workflow run`.
 */
import type {EffectPlugin} from '../src/workflow/effects/plugin.ts';

const plugin: EffectPlugin = {
	id: 'example-echo',
	name: 'Example Echo',
	description: 'Logs workflow domain on each run',
	async run(ctx) {
		console.error(
			`[workflow-effect] ${ctx.domain} ok=${ctx.report.ok} issues=${ctx.report.issueCount}`,
		);
	},
};

export default plugin;
