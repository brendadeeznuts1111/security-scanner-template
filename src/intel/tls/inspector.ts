import {
	connect,
	type DetailedPeerCertificate,
	type PeerCertificate,
	type TLSSocket,
} from 'node:tls';
import {getSystemCACertificates, resolveUseSystemCA} from './system-ca.ts';
import type {TLSInspectOptions, TLSCertificateSummary, TLSProfile} from './types.ts';

const DEFAULT_TIMEOUT_MS = 15_000;

function certFields(dn: Record<string, unknown>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(dn)) {
		if (typeof value === 'string') {
			out[key] = value;
		}
	}
	return out;
}

function summarizeCertificate(cert: PeerCertificate): TLSCertificateSummary {
	const subject = certFields(cert.subject as Record<string, unknown>);
	const issuer = certFields(cert.issuer as Record<string, unknown>);
	const expiry = new Date(cert.valid_to);
	const daysRemaining = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);

	return {
		subject,
		issuer,
		validFrom: cert.valid_from,
		validTo: cert.valid_to,
		fingerprint: cert.fingerprint ?? '',
		serialNumber: cert.serialNumber ?? '',
		daysRemaining,
		expired: daysRemaining < 0,
		selfSigned:
			Boolean(subject.CN && issuer.CN && subject.CN === issuer.CN) ||
			(JSON.stringify(subject) === JSON.stringify(issuer) && Object.keys(subject).length > 0),
	};
}

function collectChain(leaf: PeerCertificate, deep: boolean): TLSCertificateSummary[] | undefined {
	if (!deep || !leaf || Object.keys(leaf).length === 0) {
		return undefined;
	}

	const chain: TLSCertificateSummary[] = [];
	const seen = new Set<string>();
	let current: DetailedPeerCertificate | undefined = leaf as DetailedPeerCertificate;

	while (current && Object.keys(current).length > 0) {
		const fingerprint = current.fingerprint ?? current.serialNumber ?? String(chain.length);
		if (seen.has(fingerprint)) {
			break;
		}
		seen.add(fingerprint);
		chain.push(summarizeCertificate(current));
		current = current.issuerCertificate;
		if (current === leaf) {
			break;
		}
	}

	return chain.length > 0 ? chain : undefined;
}

function buildProfile(
	socket: TLSSocket,
	host: string,
	port: number,
	options: TLSInspectOptions,
): TLSProfile {
	const deep = options.deep ?? false;
	const useSystemCA = resolveUseSystemCA(options.useSystemCA, undefined);
	const cert = socket.getPeerCertificate(deep);
	const cipher = socket.getCipher();

	let trusted: boolean | undefined;
	let trustError: string | undefined;

	if (useSystemCA) {
		const systemCAs = getSystemCACertificates();
		if (systemCAs.length === 0) {
			trusted = false;
			trustError = 'system CA store is empty';
		} else {
			trusted = socket.authorized;
			if (!trusted && socket.authorizationError) {
				trustError = socket.authorizationError.message || String(socket.authorizationError);
			}
		}
	}

	return {
		host,
		port,
		protocol: socket.getProtocol?.() ?? undefined,
		alpn: socket.alpnProtocol,
		cipher: cipher
			? {
					name: cipher.name,
					standardName: cipher.standardName,
					version: cipher.version,
				}
			: undefined,
		certificate: cert && Object.keys(cert).length > 0 ? summarizeCertificate(cert) : undefined,
		trusted,
		trustError,
		validatedWithSystemCA: useSystemCA,
		chain: cert && Object.keys(cert).length > 0 ? collectChain(cert, deep) : undefined,
	};
}

/**
 * Perform a TLS handshake and extract certificate / cipher metadata.
 */
export class TLSInspector {
	static async inspect(
		host: string,
		port = 443,
		options: TLSInspectOptions = {},
	): Promise<TLSProfile> {
		const useSystemCA = resolveUseSystemCA(options.useSystemCA, undefined);
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const connectFn = options.connectFn ?? connect;
		const systemCAs = useSystemCA ? getSystemCACertificates() : undefined;
		const rejectUnauthorized = Boolean(useSystemCA && systemCAs && systemCAs.length > 0);

		return new Promise((resolve, reject) => {
			const socket = connectFn({
				host,
				port,
				servername: host,
				rejectUnauthorized,
				ca: systemCAs && systemCAs.length > 0 ? systemCAs : undefined,
				ALPNProtocols: ['h2', 'http/1.1'],
				timeout: timeoutMs,
			});

			const fail = (error: Error) => {
				socket.destroy();
				reject(error);
			};

			socket.setTimeout(timeoutMs, () => {
				fail(new Error(`TLS handshake timed out after ${timeoutMs}ms`));
			});

			socket.once('error', fail);

			socket.once('secureConnect', () => {
				try {
					const profile = buildProfile(socket, host, port, options);
					socket.end();
					resolve(profile);
				} catch (error) {
					fail(error instanceof Error ? error : new Error(String(error)));
				}
			});
		});
	}
}
