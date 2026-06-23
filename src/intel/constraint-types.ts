import type {SemverRuleSeverity} from '../policy/types.ts';

export type ConstraintCategory = 'package' | 'import' | 'license' | 'source' | 'require';

export type ConstraintViolationSource =
	| 'policy-constraint-block'
	| 'policy-constraint-allow'
	| 'policy-constraint-require'
	| 'policy-constraint-import'
	| 'policy-constraint-license'
	| 'policy-constraint-source';

export interface ConstraintViolation {
	category: ConstraintCategory;
	source: ConstraintViolationSource;
	severity: SemverRuleSeverity;
	message: string;
	ruleId?: string;
	package?: string;
	version?: string;
	file?: string;
	line?: number;
	column?: number;
	snippet?: string;
	remediation?: string;
}

export interface ConstraintScanReport {
	domain?: string;
	root: string;
	scannedPackages: number;
	scannedFiles: number;
	transitive: boolean;
	violations: ConstraintViolation[];
}
