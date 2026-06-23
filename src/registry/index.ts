import {SemverMatcher} from '../provider/semver-matcher.ts';
import {IntegrityHasher} from '../integrity/hasher.ts';
import {ReportGenerator} from '../report/generator.ts';
import {type FeatureName} from '../features/index.ts';
import {VisualRegistry} from '../visual/index.ts';
import {
	PROFILES,
	profileDescription,
	profileFeatures as resolveProfileFeatures,
	type BuildProfile,
} from '../build/profiles.ts';

export {SemverMatcher, IntegrityHasher, ReportGenerator};
export {
	QRGenerator,
	QRCache,
	MASTER_TOKEN_SECRET,
	type QRGenerateOptions,
	type QrCacheMapping,
} from '../visual/index.ts';
export {runDomainQr, getDomainMasterToken, resolveDomainMasterKeyNames} from '../cli/qr.ts';
export {TLSInspector, isSystemCAAvailable, type TLSProfile} from '../intel/tls/index.ts';

export class Registry {
	readonly semver = new SemverMatcher();
	readonly integrity = new IntegrityHasher();
	readonly report = new ReportGenerator();
	readonly visual = new VisualRegistry();

	constructor() {}

	featuresForProfile(profile: BuildProfile): FeatureName[] {
		return resolveProfileFeatures(profile);
	}

	profileFeatures(profile: BuildProfile): FeatureName[] {
		return resolveProfileFeatures(profile);
	}

	buildProfiles(): Readonly<Record<BuildProfile, readonly FeatureName[]>> {
		return PROFILES;
	}

	describeProfile(profile: BuildProfile): string {
		return profileDescription(profile);
	}
}
