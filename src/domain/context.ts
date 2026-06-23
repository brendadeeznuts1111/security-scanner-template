import type {DomainConfig} from '../config/types.ts';
import {
	colorizeDomain,
	domainBannerLines,
	domainBrandingProfile,
	domainColorSwatches,
	domainDisplayName,
	domainPromptLabel,
	domainServiceName,
	formatColorSwatch,
	type DomainBrandingProfile,
} from './branding.ts';
import {
	domainFieldValueRows,
	formatBrandingShowcase,
	formatFieldMatrixTable,
	type DomainFieldValueRow,
	type FieldMatrixOptions,
} from './field-matrix.ts';
import {ConfigVault, createConfigVault} from './vault-config.ts';
import {describeBadge, writeDomainBadge, type DomainBadgeOptions} from '../image/badge.ts';

export {domainDisplayName, domainServiceName, domainPromptLabel, domainBrandingProfile};
export type {DomainBrandingProfile, DomainFieldValueRow};

/**
 * Loaded domain view for the interactive shell — naming, colors, secrets, badges.
 */
export class DomainContext {
	readonly vault: ConfigVault;

	constructor(readonly config: DomainConfig) {
		this.vault = createConfigVault(config);
	}

	get displayName(): string {
		return domainDisplayName(this.config);
	}

	get serviceName(): string {
		return domainServiceName(this.config);
	}

	promptLabel(): string {
		return domainPromptLabel(this.config);
	}

	bannerLines(): string[] {
		return domainBannerLines(this.config);
	}

	colorSwatches() {
		return domainColorSwatches(this.config);
	}

	say(
		terminal: {writeln(text: string): void},
		channel: Parameters<typeof colorizeDomain>[1],
		text: string,
	): void {
		terminal.writeln(colorizeDomain(this.config, channel, text));
	}

	async writeBadge(options: DomainBadgeOptions = {}): Promise<string> {
		return writeDomainBadge(this.config, options);
	}

	describeBadge(badgePath: string, size = 48): string {
		return describeBadge(this.config, badgePath, size);
	}

	formatSwatch(swatch: ReturnType<typeof domainColorSwatches>[number]): string {
		return formatColorSwatch(swatch);
	}

	brandingProfile(): DomainBrandingProfile {
		return domainBrandingProfile(this.config);
	}

	fieldMatrixRows(options?: FieldMatrixOptions): DomainFieldValueRow[] {
		return domainFieldValueRows(this.config, options);
	}

	formatFieldMatrix(options?: FieldMatrixOptions & {includeDescription?: boolean}): string {
		const rows = this.fieldMatrixRows({section: options?.section});
		return formatFieldMatrixTable(rows, {
			includeDescription: options?.includeDescription,
			values: true,
			valueRows: rows,
		});
	}

	brandingShowcaseLines(): string[] {
		return formatBrandingShowcase(this.brandingProfile());
	}
}

export function createDomainContext(config: DomainConfig): DomainContext {
	return new DomainContext(config);
}
