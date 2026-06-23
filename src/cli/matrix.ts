#!/usr/bin/env bun
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry} from '../config/registry.ts';
import {loadDomainConfigById, loadTemplate} from '../config/loader.ts';
import {
	DOMAIN_FIELD_MATRIX,
	domainFieldAlignmentRows,
	domainFieldValueRows,
	filterFieldMatrix,
	formatAlignmentMatrixTable,
	formatBrandingShowcase,
	formatFieldMatrixTable,
	listFieldMatrixSections,
	loadTemplateFieldMatrix,
	validateTemplateFieldCoverage,
	type DomainFieldSection,
} from '../domain/field-matrix.ts';
import {domainBrandingProfile, formatConcernColorTable} from '../domain/branding.ts';
import {
	CONCERN_COLOR_RULES,
	concernRulesByTag,
	resolveConcernColors,
	type ConcernTag,
} from '../domain/concern-colors.ts';
import {isMainModule} from '../utils/runtime.ts';

const SECTIONS = listFieldMatrixSections();

function isSection(value: string): value is DomainFieldSection {
	return (SECTIONS as string[]).includes(value);
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			'domain': {type: 'string'},
			'section': {type: 'string'},
			'template': {type: 'boolean'},
			'branding': {type: 'boolean'},
			'validate': {type: 'boolean'},
			'description': {type: 'boolean'},
			'only-set': {type: 'boolean'},
			'concerns': {type: 'boolean'},
			'alignment': {type: 'boolean'},
			'defaults': {type: 'boolean'},
			'tag': {type: 'string'},
			'json': {type: 'boolean'},
			'help': {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`Usage:
  bun run matrix [--template] [--domain <reverse-dns>] [--section <name>]
  bun run matrix --branding --domain <reverse-dns>
  bun run matrix --concerns [--domain <reverse-dns> | --template] [--tag vault]
  bun run matrix --validate
  bun run matrix --domain <reverse-dns> --alignment [--section <name>] [--json]
  bun run matrix --template --defaults

Show the domain field matrix: template × domain × branding × service × secrets.
--alignment adds value/default/source/options columns with strong defaults.
Concern map: ast-grep-style tags → channels/colors with base + bright values.

Sections: ${SECTIONS.join(', ')}`);
		process.exit(0);
	}

	if (values.validate) {
		const result = await validateTemplateFieldCoverage();
		if (values.json) {
			console.log(JSON.stringify(result, null, 2));
		} else if (result.ok) {
			console.log(
				colorize(
					TERMINAL.scannerOk,
					`[matrix] template documents all ${DOMAIN_FIELD_MATRIX.length} catalog fields`,
				),
			);
		} else {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[matrix] template missing ${result.missing.length} field(s): ${result.missing.join(', ')}`,
				),
			);
		}
		process.exit(result.ok ? 0 : 1);
	}

	const section = values.section && isSection(values.section) ? values.section : undefined;

	if (values.concerns) {
		let config;
		if (values.domain) {
			config = await loadDomainConfigById(process.cwd(), values.domain);
		} else if (values.template) {
			config = await loadTemplate();
		} else {
			console.error(
				colorize(TERMINAL.scannerFatal, '[matrix] --concerns requires --domain or --template'),
			);
			process.exit(1);
		}

		const tag = values.tag as ConcernTag | undefined;
		if (values.json) {
			const payload = tag
				? concernRulesByTag(tag)
				: {rules: CONCERN_COLOR_RULES, resolved: resolveConcernColors(config)};
			console.log(JSON.stringify(payload, null, 2));
			process.exit(0);
		}

		if (tag) {
			console.log(colorize(TERMINAL.scannerInfo, `concern rules tagged: ${tag}`));
			for (const rule of concernRulesByTag(tag)) {
				console.log(`${rule.id} → ${rule.colorPath} [${rule.tags.join(',')}]`);
			}
			process.exit(0);
		}

		console.log(
			colorize(TERMINAL.scannerInfo, 'concern color map (id | concern | tags | base | bright)'),
		);
		console.log(formatConcernColorTable(config));
		process.exit(0);
	}

	if (values.branding) {
		let config;
		if (values.domain) {
			await domainRegistry.loadAll();
			config = domainRegistry.get(values.domain);
		} else if (values.template) {
			config = await loadTemplate();
		} else {
			console.error(
				colorize(TERMINAL.scannerFatal, '[matrix] --branding requires --domain or --template'),
			);
			process.exit(1);
		}

		const profile = domainBrandingProfile(config);
		if (values.json) {
			console.log(JSON.stringify(profile, null, 2));
		} else {
			for (const line of formatBrandingShowcase(profile)) {
				console.log(line);
			}
		}
		process.exit(0);
	}

	let rows = filterFieldMatrix({section});
	let valueRows;
	let title = 'domain field matrix';

	if (values.template || positionals[0] === 'template') {
		const loaded = await loadTemplateFieldMatrix();
		if (values.alignment || values.defaults) {
			const alignmentRows = domainFieldAlignmentRows(loaded.template, {section});
			title = `template alignment matrix (${loaded.template.domain})`;
			if (values.json) {
				console.log(JSON.stringify(alignmentRows, null, 2));
				process.exit(0);
			}
			console.log(colorize(TERMINAL.scannerInfo, title));
			console.log(formatAlignmentMatrixTable(alignmentRows));
			process.exit(0);
		}
		valueRows = loaded.rows;
		if (section) {
			valueRows = valueRows.filter(row => row.section === section);
			rows = rows.filter(row => row.section === section);
		}
		title = `template field matrix (${loaded.template.domain})`;
	} else if (values.domain) {
		await domainRegistry.loadAll();
		const config = domainRegistry.get(values.domain);
		if (values.alignment) {
			const alignmentRows = domainFieldAlignmentRows(config, {
				section,
				onlySet: values['only-set'] === true,
			});
			title = `alignment matrix (${values.domain})`;
			if (values.json) {
				console.log(JSON.stringify(alignmentRows, null, 2));
				process.exit(0);
			}
			console.log(colorize(TERMINAL.scannerInfo, title));
			console.log(formatAlignmentMatrixTable(alignmentRows));
			process.exit(0);
		}
		valueRows = domainFieldValueRows(config, {
			section,
			onlySet: values['only-set'] === true,
		});
		rows = valueRows;
		title = `domain field matrix (${values.domain})`;
	} else if (values['only-set']) {
		console.error(
			colorize(TERMINAL.scannerFatal, '[matrix] --only-set requires --domain or --template'),
		);
		process.exit(1);
	}

	if (values.json) {
		const payload = valueRows ?? rows;
		console.log(JSON.stringify(payload, null, 2));
		process.exit(0);
	}

	if (values.defaults && valueRows) {
		const alignmentRows = domainFieldAlignmentRows(
			values.domain
				? domainRegistry.get(values.domain)
				: (await loadTemplateFieldMatrix()).template,
			{section},
		);
		title = values.domain
			? `alignment matrix (${values.domain})`
			: `template alignment matrix (${alignmentRows[0]?.value ? 'template' : 'defaults'})`;
		console.log(colorize(TERMINAL.scannerInfo, title));
		console.log(formatAlignmentMatrixTable(alignmentRows));
		process.exit(0);
	}

	console.log(colorize(TERMINAL.scannerInfo, title));
	console.log(
		formatFieldMatrixTable(rows, {
			includeDescription: values.description === true,
			values: valueRows !== undefined || values.defaults === true,
			valueRows,
		}),
	);
}

const __matrixCliMain =
	isMainModule() ||
	(process.argv[1]?.includes('matrix.ts') ?? false) ||
	(Bun.argv[1]?.includes('matrix.ts') ?? false);

if (__matrixCliMain) {
	await main();
}
