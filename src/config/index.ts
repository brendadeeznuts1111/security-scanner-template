export type {DomainConfig, LoadedDomain} from './types.ts';
export {applyDefaults, deepMerge, DEFAULT_CONFIG} from './defaults.ts';
export {
	discoverDomainFiles,
	DOMAIN_GLOB,
	loadAllDomains,
	loadDomainFile,
	loadTemplate,
	TEMPLATE_PATH,
} from './loader.ts';
export {checkAllDomains, checkDomain, type DoctorIssue, type DoctorResult} from './doctor.ts';
export {createDomainRegistry, domainRegistry, type DomainRegistry} from './registry.ts';
