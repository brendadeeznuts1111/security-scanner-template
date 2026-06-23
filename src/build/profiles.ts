import type {FeatureName} from '../features/index.ts';

export type BuildProfile = 'agent' | 'server' | 'dev';

/**
 * Deployment profiles — each maps to a feature set compiled into a bundle.
 *
 * | Profile | Use case |
 * |---------|----------|
 * | agent   | Lightweight edge runtime (JSONL audit, DNS intel, external scanners) |
 * | server  | Full enterprise server (SQLite audit, HTML reports, Redis cache) |
 * | dev     | Local development (debug tooling, mock APIs, WebSocket feeds) |
 */
export const PROFILES: Record<BuildProfile, readonly FeatureName[]> = {
	agent: ['AUDIT_JSONL', 'INTEL_DNS', 'SCAN_EXTERNAL'],
	server: ['AUDIT_SQLITE', 'REPORT_HTML', 'CACHE_REDIS', 'INTEL_DNS'],
	dev: ['DEBUG', 'MOCK_API', 'FEED_WEBSOCKET', 'AUDIT_JSONL', 'REPORT_MARKDOWN'],
} as const;

export const PROFILE_NAMES = Object.keys(PROFILES) as BuildProfile[];

export function isBuildProfile(value: string): value is BuildProfile {
	return value in PROFILES;
}

/**
 * Resolve a profile name to its enabled feature list.
 */
export function profileFeatures(profile: BuildProfile): FeatureName[] {
	return [...PROFILES[profile]];
}

/**
 * Human-readable description for each profile.
 */
export function profileDescription(profile: BuildProfile): string {
	switch (profile) {
		case 'agent':
			return 'Lightweight edge agent — JSONL audit, DNS intel, external scanners';
		case 'server':
			return 'Enterprise server — SQLite audit, HTML reports, Redis cache';
		case 'dev':
			return 'Local development — debug, mock APIs, WebSocket feeds';
	}
}