import {mkdirSync, rmSync, writeFileSync} from 'fs';
import path from 'path';
import {afterEach, expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	collectDoctorNetworkSnapshot,
	EMPTY_NETWORK_SNAPSHOT,
} from '../../src/domain/doctor-snapshot-network.ts';
import {
	computeDomainFingerprint,
	diffDoctorSnapshotDomains,
} from '../../src/domain/doctor-snapshot-deep.ts';
import {buildDomainSnapshot} from '../../src/domain/doctor-snapshot.ts';
import {isSnapshotDriftSection} from '../../src/domain/doctor-snapshot-gate.ts';

const tmpRoot = path.join(import.meta.dir, '.tmp-network-snapshot');

afterEach(() => {
	try {
		rmSync(tmpRoot, {recursive: true, force: true});
	} catch {
		/* best effort */
	}
});

test('collectDoctorNetworkSnapshot returns empty sentinel when network disabled', async () => {
	const config = applyDefaults({domain: 'com.example.off'});
	const snapshot = await collectDoctorNetworkSnapshot('/proj', 'com.example.off', config);
	expect(snapshot).toEqual(EMPTY_NETWORK_SNAPSHOT);
});

test('collectDoctorNetworkSnapshot scans dist endpoints when network enabled', async () => {
	mkdirSync(path.join(tmpRoot, 'dist'), {recursive: true});
	writeFileSync(
		path.join(tmpRoot, 'dist', 'app.js'),
		`fetch("https://api.example.com/v1"); app.get("/api/health");`,
	);

	const config = applyDefaults({
		domain: 'com.example.net',
		service: {
			network: {
				enabled: true,
				distPath: 'dist',
				healthUrl: 'https://example.com/health',
			},
		},
	});

	const snapshot = await collectDoctorNetworkSnapshot(tmpRoot, 'com.example.net', config);
	expect(snapshot.enabled).toBe(true);
	expect(snapshot.distPath).toBe('dist');
	expect(snapshot.endpoints).toContain('https://api.example.com/v1');
	expect(snapshot.healthRoutes).toContain('/api/health');
	expect(snapshot.scanned).toBe(true);
});

test('network section participates in fingerprint and drift diff', () => {
	const base = buildDomainSnapshot({
		domain: 'com.example.net',
		path: '/tmp/com.example.net.security.json5',
		ok: true,
		issues: [],
	});
	const withRoutes = buildDomainSnapshot(
		{
			domain: 'com.example.net',
			path: '/tmp/com.example.net.security.json5',
			ok: true,
			issues: [],
		},
		{
			network: {
				enabled: true,
				distPath: 'dist',
				baselinePresent: false,
				endpoints: ['https://api.example.com'],
				healthRoutes: ['/health'],
				health: 'unknown',
				scanned: true,
			},
		},
	);

	expect(computeDomainFingerprint(base)).not.toBe(computeDomainFingerprint(withRoutes));
	const diff = diffDoctorSnapshotDomains(withRoutes, base);
	expect(diff.sections).toContain('network');
});

test('isSnapshotDriftSection accepts network gate section', () => {
	expect(isSnapshotDriftSection('network')).toBe(true);
});
