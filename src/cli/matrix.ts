#!/usr/bin/env bun
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry} from '../config/registry.ts';
import {loadTemplate} from '../config/loader.ts';
import {
	DOMAIN_FIELD_MATRIX,
	domainFieldValueRows,
	filterFieldMatrix,
	formatBrandingShowcase,
	formatFieldMatrixTable,
	listFieldMatrixSections,
	loadTemplateFieldMatrix,
	validateTemplateFieldCoverage,
	type DomainFieldSection,
} from '../domain/field-matrix.ts';
import {domainBrandingProfile} from '../domain/branding.ts';
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
			'json': {type: 'boolean'},
			'help': {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`Usage:
  bun run matrix [--template] [--domain <reverse-dns>] [--section <name>]
  bun run matrix --branding --domain <reverse-dns>
  bun run matrix --validate

Show the domain field matrix: template × domain × branding × service × secrets.

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
		valueRows = loaded.rows;
		if (section) {
			valueRows = valueRows.filter(row => row.section === section);
			rows = rows.filter(row => row.section === section);
		}
		title = `template field matrix (${loaded.template.domain})`;
	} else if (values.domain) {
		await domainRegistry.loadAll();
		const config = domainRegistry.get(values.domain);
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

	console.log(colorize(TERMINAL.scannerInfo, title));
	console.log(
		formatFieldMatrixTable(rows, {
			includeDescription: values.description === true,
			values: valueRows !== undefined,
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
