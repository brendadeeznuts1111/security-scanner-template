#!/usr/bin/env bun
import {bench, run} from '../runner.mjs';
import {
	DOMAIN_FIELD_MATRIX,
	matrixLayerCounts,
	validateTemplateFieldCoverage,
} from '../../src/domain/field-matrix.ts';

bench('field-matrix.layerCounts', () => {
	matrixLayerCounts();
});

bench('field-matrix.catalogSize', () => {
	let size = 0;
	for (const row of DOMAIN_FIELD_MATRIX) {
		size += row.field.length;
	}
	return size;
});

bench('field-matrix.validateTemplate', async () => {
	await validateTemplateFieldCoverage();
});

await run();
