import {loadAllDomains} from '../src/config/loader.ts';

async function main() {
	const domains = await loadAllDomains(process.cwd());

	console.log(`Loaded ${domains.length} domain(s):\n`);
	for (const d of domains) {
		console.log(`  ${d.domain}`);
		console.log(`    primary: ${d.config.colors.primary}`);
		console.log(`    fatal:   ${d.config.colors.fatal}`);
		console.log(`    feed:    ${d.config.supplyChain.feed.remote ?? 'default'}`);
		console.log(`    secrets: ${d.config.secrets.inventory.length}`);
		console.log();
	}
}

main().catch(error => {
	console.error('Demo failed:', error);
	process.exit(1);
});
