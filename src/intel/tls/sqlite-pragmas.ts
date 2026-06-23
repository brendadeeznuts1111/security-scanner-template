import type {Database} from 'bun:sqlite';

/** Full-precision float text conversion (SQLite 3.53+ / SQLITE_DBCONFIG_FP_DIGITS). */
export const DEFAULT_SQLITE_FP_PRECISION = 15;

/** Safe SQL parser stack depth cap (SQLite 3.53+ / SQLITE_LIMIT_PARSER_DEPTH). */
export const DEFAULT_SQLITE_PARSER_DEPTH = 1000;

export interface SqliteSecurityPragmaOptions {
	fpPrecision?: number;
	parserDepth?: number;
}

/**
 * Apply SQLite 3.53 security and precision PRAGMAs for audit/history databases.
 */
export function applySqliteSecurityPragmas(
	db: Database,
	options: SqliteSecurityPragmaOptions = {},
): void {
	const fpPrecision = options.fpPrecision ?? DEFAULT_SQLITE_FP_PRECISION;
	const parserDepth = options.parserDepth ?? DEFAULT_SQLITE_PARSER_DEPTH;

	db.exec(`PRAGMA fp_precision = ${fpPrecision};`);
	db.exec(`PRAGMA parser_depth = ${parserDepth};`);
}
