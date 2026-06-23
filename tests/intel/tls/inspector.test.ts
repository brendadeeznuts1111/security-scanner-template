import {expect, test, beforeEach, afterEach} from 'bun:test';
import {EventEmitter} from 'node:events';
import type {PeerCertificate, TLSSocket} from 'node:tls';
import {TLSInspector} from '../../../src/intel/tls/inspector.ts';
import {clearSystemCACache, seedSystemCACacheForTests} from '../../../src/intel/tls/system-ca.ts';

const PEM = '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----';

function fakeCert(): PeerCertificate {
	return {
		subject: {CN: 'example.com'},
		issuer: {CN: 'Test CA', O: 'Acme'},
		valid_from: 'Jan  1 00:00:00 2025 GMT',
		valid_to: 'Jan  1 00:00:00 2030 GMT',
		fingerprint: 'AA:BB:CC',
		serialNumber: '01',
	} as PeerCertificate;
}

function createMockSocket(authorized: boolean, authorizationError?: string): TLSSocket {
	const socket = new EventEmitter() as TLSSocket;
	Object.assign(socket, {
		authorized,
		authorizationError,
		alpnProtocol: 'h2',
		getProtocol: () => 'TLSv1.3',
		getCipher: () => ({
			name: 'TLS_AES_128_GCM_SHA256',
			standardName: 'TLS_AES_128_GCM_SHA256',
			version: 'TLSv1.3',
		}),
		getPeerCertificate: () => fakeCert(),
		end: () => {},
		destroy: () => {},
		setTimeout: () => socket,
	});
	return socket;
}

beforeEach(() => {
	clearSystemCACache();
	seedSystemCACacheForTests([]);
});

afterEach(() => {
	clearSystemCACache();
});

test('TLSInspector reports trusted when system CA validation succeeds', async () => {
	seedSystemCACacheForTests([PEM]);

	const profile = await TLSInspector.inspect('example.com', 443, {
		useSystemCA: true,
		connectFn: () => {
			const socket = createMockSocket(true);
			queueMicrotask(() => socket.emit('secureConnect'));
			return socket;
		},
	});

	expect(profile.validatedWithSystemCA).toBe(true);
	expect(profile.trusted).toBe(true);
	expect(profile.certificate?.subject.CN).toBe('example.com');
	expect(profile.protocol).toBe('TLSv1.3');
});

test('TLSInspector reports trust error when system CA validation fails', async () => {
	seedSystemCACacheForTests([PEM]);

	const profile = await TLSInspector.inspect('example.com', 443, {
		useSystemCA: true,
		connectFn: () => {
			const socket = createMockSocket(false, 'unable to get local issuer certificate');
			queueMicrotask(() => socket.emit('secureConnect'));
			return socket;
		},
	});

	expect(profile.trusted).toBe(false);
	expect(profile.trustError).toContain('unable to get local issuer certificate');
});

test('TLSInspector auto-enables trust validation when system CAs are available', async () => {
	seedSystemCACacheForTests([PEM]);

	const profile = await TLSInspector.inspect('example.com', 443, {
		connectFn: () => {
			const socket = createMockSocket(true);
			queueMicrotask(() => socket.emit('secureConnect'));
			return socket;
		},
	});

	expect(profile.validatedWithSystemCA).toBe(true);
	expect(profile.trusted).toBe(true);
});

test('TLSInspector skips trust validation when useSystemCA is false', async () => {
	const profile = await TLSInspector.inspect('example.com', 443, {
		useSystemCA: false,
		connectFn: () => {
			const socket = createMockSocket(false, 'self signed certificate');
			queueMicrotask(() => socket.emit('secureConnect'));
			return socket;
		},
	});

	expect(profile.validatedWithSystemCA).toBe(false);
	expect(profile.trusted).toBeUndefined();
	expect(profile.trustError).toBeUndefined();
});