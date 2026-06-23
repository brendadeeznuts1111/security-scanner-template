import {computeBundleSnapshot} from './doctor-snapshot-bundles.ts';
import type {BundleSnapshot} from './doctor-snapshot-bundles.ts';
import type {DomainConfig} from '../config/types.ts';

export interface BundleSnapshotWorkerInput {
	root: string;
	domain: string;
	config: DomainConfig;
}

export interface BundleSnapshotWorkerResult {
	domain: string;
	bundleSnapshot: BundleSnapshot | null;
}

declare const self: Worker;

self.onmessage = async (event: MessageEvent<BundleSnapshotWorkerInput>) => {
	const {root, domain, config} = event.data;
	const bundleSnapshot = await computeBundleSnapshot(root, config);
	const payload: BundleSnapshotWorkerResult = {domain, bundleSnapshot};
	self.postMessage(payload);
};
