import {checkLoadedDomain} from '../config/doctor.ts';
import type {LoadedDomain} from '../config/types.ts';

export interface DomainCheckResult {
	domain: string;
	path: string;
	ok: boolean;
	issues: import('../config/doctor.ts').DoctorIssue[];
}

declare const self: Worker;

self.onmessage = async (event: MessageEvent<LoadedDomain>) => {
	const loaded = event.data;
	const result = await checkLoadedDomain(loaded);
	const payload: DomainCheckResult = {
		domain: loaded.domain,
		path: loaded.path,
		ok: result.ok,
		issues: result.issues,
	};
	self.postMessage(payload);
};
