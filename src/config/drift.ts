import {cloneStructured} from '../utils/jsc.ts';
import {deepEquals} from '../utils/runtime.ts';
import type {DomainConfig} from './types.ts';

export interface ConfigDrift {
	field: string;
	message: string;
}

/**
 * Compare a loaded domain config against a baseline using Bun.deepEquals.
 */
export function detectConfigDrift(
	loaded: DomainConfig,
	baseline: DomainConfig,
): ConfigDrift[] {
	const drifts: ConfigDrift[] = [];
	const normalizedLoaded = cloneStructured(loaded);
	const normalizedBaseline = cloneStructured(baseline);

	const sections: Array<{field: keyof DomainConfig; label: string}> = [
		{field: 'colors', label: 'colors'},
		{field: 'channels', label: 'channels'},
		{field: 'identity', label: 'identity'},
		{field: 'token', label: 'token'},
		{field: 'csrf', label: 'csrf'},
		{field: 'supplyChain', label: 'supplyChain'},
		{field: 'ops', label: 'ops'},
		{field: 'visual', label: 'visual'},
	];

	for (const {field, label} of sections) {
		if (!deepEquals(normalizedLoaded[field], normalizedBaseline[field])) {
			drifts.push({
				field: label,
				message: `${label} differs from the golden template`,
			});
		}
	}

	return drifts;
}