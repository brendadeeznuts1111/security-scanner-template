export {
	lookupHostname,
	inspectDomain,
	inspectFeedUrl,
	hostnameFromUrl,
	type DnsAddress,
	type DnsInspectionResult,
	type DnsThreatConfig,
} from '../threat-intel/dns.ts';

import {inspectDomain, inspectFeedUrl} from '../threat-intel/dns.ts';
import type {DnsThreatConfig} from '../threat-intel/dns.ts';

/**
 * Per-domain DNS threat checker.
 */
export class DNSThreatChecker {
	constructor(private readonly config: DnsThreatConfig) {}

	inspect(hostname: string) {
		return inspectDomain(hostname, this.config);
	}

	inspectUrl(url: string) {
		return inspectFeedUrl(url, this.config);
	}
}
