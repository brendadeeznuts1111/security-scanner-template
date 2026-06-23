/**
 * TLS-configured fetch for workflow webhook alerts.
 *
 * @see https://github.com/oven-sh/bun/blob/main/docs/api/fetch.mdx
 */
import path from 'path';
import type {WorkflowTlsConfig} from './types.ts';

export interface BunFetchTlsOptions {
	rejectUnauthorized?: boolean;
	ca?: string | string[];
	cert?: string;
	key?: string;
}

export type WorkflowFetchFn = (
	url: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

async function readTlsMaterial(
	value: string | undefined,
	projectRoot: string,
): Promise<string | undefined> {
	if (!value) {
		return undefined;
	}
	if (value.includes('-----BEGIN')) {
		return value;
	}
	const resolved = path.isAbsolute(value) ? value : path.join(projectRoot, value);
	const file = Bun.file(resolved);
	if (await file.exists()) {
		return file.text();
	}
	return value;
}

export async function resolveWorkflowTlsOptions(
	tls: WorkflowTlsConfig | undefined,
	projectRoot: string,
): Promise<BunFetchTlsOptions | undefined> {
	if (!tls) {
		return undefined;
	}

	const caValues = tls.ca
		? await Promise.all(
				(Array.isArray(tls.ca) ? tls.ca : [tls.ca]).map(entry =>
					readTlsMaterial(entry, projectRoot),
				),
			)
		: [];
	const ca = caValues.filter((entry): entry is string => Boolean(entry));
	const cert = await readTlsMaterial(tls.cert, projectRoot);
	const key = await readTlsMaterial(tls.key, projectRoot);

	if (ca.length === 0 && !cert && !key && tls.rejectUnauthorized === undefined) {
		return undefined;
	}

	return {
		rejectUnauthorized: tls.rejectUnauthorized ?? true,
		...(ca.length > 0 ? {ca: ca.length === 1 ? ca[0]! : ca} : {}),
		...(cert ? {cert} : {}),
		...(key ? {key} : {}),
	};
}

export function createWorkflowFetch(
	tlsOptions: BunFetchTlsOptions | undefined,
	baseFetch: WorkflowFetchFn = fetch,
): WorkflowFetchFn {
	if (!tlsOptions) {
		return baseFetch;
	}
	return (url, init) =>
		baseFetch(url, {
			...init,
			tls: tlsOptions,
		} as RequestInit & {tls: BunFetchTlsOptions});
}
