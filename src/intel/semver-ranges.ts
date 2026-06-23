import type {SemverRule} from '../policy/types.ts';

/** Derive a safe upgrade range from a vulnerability rule when `safeRange` is omitted. */
export function deriveSafeRange(rule: Pick<SemverRule, 'range' | 'safeRange'>): string {
	if (rule.safeRange) {
		return rule.safeRange;
	}
	if (rule.range.startsWith('<=')) {
		return `>${rule.range.slice(2).trim()}`;
	}
	if (rule.range.startsWith('<')) {
		return `>=${rule.range.slice(1).trim()}`;
	}
	return '>=0.0.0';
}

/** Build a remediation target range from a threat-feed entry. */
export function safeRangeFromThreat(entry: {fixedIn?: string; versionRange: string}): string {
	if (entry.fixedIn) {
		return `>=${entry.fixedIn}`;
	}
	return deriveSafeRange({range: entry.versionRange});
}
