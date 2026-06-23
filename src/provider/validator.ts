import {z} from 'zod';

export const ThreatCategorySchema = z.enum([
	'protestware',
	'adware',
	'backdoor',
	'malware',
	'botnet',
	'token-stealer',
	'deprecated',
	'unmaintained',
]);

export const ThreatFeedItemSchema = z.object({
	package: z.string(),
	range: z.string(),
	url: z.string().nullable(),
	description: z.string().nullable(),
	categories: z.array(ThreatCategorySchema),
	hashes: z.array(z.string()).optional(),
});

export const AllowlistItemSchema = z.object({
	package: z.string(),
	range: z.string().default('*'),
	reason: z.string().optional(),
});

export const ThreatFeedDocumentSchema = z.object({
	rules: z.array(ThreatFeedItemSchema),
	allowlist: z.array(AllowlistItemSchema).optional(),
});

export const ThreatFeedInputSchema = z.union([
	z.array(ThreatFeedItemSchema),
	ThreatFeedDocumentSchema,
]);

export const ThreatFeedSchema = z.array(ThreatFeedItemSchema);

export type ThreatCategory = z.infer<typeof ThreatCategorySchema>;
export type ThreatFeedItem = z.infer<typeof ThreatFeedItemSchema>;
export type AllowlistItem = z.infer<typeof AllowlistItemSchema>;
export type ThreatFeedDocument = z.infer<typeof ThreatFeedDocumentSchema>;

export function normalizeThreatFeed(data: unknown): {
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
} {
	const parsed = ThreatFeedInputSchema.parse(data);

	if (Array.isArray(parsed)) {
		return {rules: parsed, allowlist: []};
	}

	return {rules: parsed.rules, allowlist: parsed.allowlist ?? []};
}
