import {z} from 'zod';
import {DOCTOR_SNAPSHOT_SEMVER} from './snapshot-types.ts';

const DOCTOR_SNAPSHOT_SCHEMA_VERSION = 2 as const;

const SemverStringSchema = z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/);

export const BundleSnapshotSchema = z
	.object({
		path: z.string(),
		hash: z.string(),
		fileCount: z.number().int().nonnegative(),
		lastScan: z.string(),
	})
	.nullable()
	.optional();

export const DomainSnapshotSchema = z.object({
	id: z.string(),
	path: z.string(),
	ok: z.boolean(),
	issues: z.array(
		z.object({
			field: z.string(),
			severity: z.enum(['error', 'warning']),
			code: z.string().optional(),
		}),
	),
	secretInventoryNames: z.array(z.string()),
	layerCounts: z.record(z.string(), z.number()),
	filename: z.object({
		expected: z.string(),
		actual: z.string(),
		ok: z.boolean(),
	}),
	vault: z.object({
		path: z.string().optional(),
		present: z.boolean(),
		format: z.enum(['json5', 'missing']),
		inventoryCount: z.number(),
		encryptedStore: z.string().optional(),
		masterKeyName: z.string().optional(),
		version: z.number().optional(),
	}),
	policy: z.object({
		enabled: z.boolean(),
		fatal: z.array(z.string()),
		warn: z.array(z.string()),
		feedSource: z.enum(['local', 'remote', 'none']),
		feedUrl: z.string().optional(),
		tomlAligned: z.boolean(),
	}),
	concerns: z.object({
		csrfEnabled: z.boolean(),
		tlsUseSystemCA: z.boolean().optional(),
		auditKind: z.enum(['jsonl', 'sqlite', 'none']),
		auditPath: z.string().optional(),
	}),
	templateDrift: z.array(
		z.object({
			field: z.string(),
			message: z.string(),
		}),
	),
	bundles: BundleSnapshotSchema,
	network: z
		.object({
			enabled: z.boolean(),
			distPath: z.string().optional(),
			baselinePresent: z.boolean(),
			endpoints: z.array(z.string()),
			healthRoutes: z.array(z.string()),
			health: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']),
			scanned: z.boolean(),
		})
		.nullable()
		.optional(),
	fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	branding: z.record(z.string(), z.unknown()).optional(),
	matrix: z
		.array(
			z.object({
				field: z.string(),
				section: z.string(),
				value: z.string(),
				source: z.string(),
			}),
		)
		.optional(),
});

export const DoctorSnapshotV2Schema = z.object({
	schema: z.literal('doctor-domain-snapshot'),
	version: z.literal(DOCTOR_SNAPSHOT_SCHEMA_VERSION),
	snapshotVersion: SemverStringSchema,
	scannerVersion: SemverStringSchema.optional(),
	capturedAt: z.string(),
	domain: z.string(),
	fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	bun: z.object({
		version: z.string(),
		revision: z.string(),
	}),
	snapshotRuntime: z.object({
		nativeFlags: z.array(z.string()),
		matcherAvailable: z.boolean(),
	}),
	domainEntry: DomainSnapshotSchema,
});

export const SemverRuleSchema = z.object({
	id: z.string(),
	package: z.string(),
	range: z.string(),
	severity: z.enum(['low', 'medium', 'high', 'critical']),
	description: z.string(),
	category: z.string().optional(),
});

export const PolicySemverSchema = z.object({
	rules: z.array(SemverRuleSchema),
});
