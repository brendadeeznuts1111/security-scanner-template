import {isImageAvailable} from '../visual/load.ts';
import {PlaceholderGenerator} from '../visual/placeholder.ts';
import {escapeHtml} from './safe.ts';
import type {ReportOperatorQr, ReportVisual} from './types.ts';

/**
 * Fill missing placeholder data URLs from on-disk image sources.
 */
export async function resolveReportVisuals(visuals: ReportVisual[]): Promise<ReportVisual[]> {
	if (!visuals.length) {
		return [];
	}

	const resolved: ReportVisual[] = [];

	for (const visual of visuals) {
		let placeholderDataUrl = visual.placeholderDataUrl;

		if (!placeholderDataUrl && isImageAvailable()) {
			const source = visual.thumbnailPath ?? visual.normalizedPath ?? visual.imagePath;
			if (source) {
				try {
					placeholderDataUrl = await PlaceholderGenerator.generate(source);
				} catch {
					// Skip visuals that cannot be decoded in this runtime.
				}
			}
		}

		resolved.push({...visual, placeholderDataUrl});
	}

	return resolved;
}

/**
 * Render the domain operator QR panel (vault master token — sensitive).
 */
export function renderOperatorQr(operatorQr?: ReportOperatorQr): string {
	if (!operatorQr?.dataUrl) {
		return '';
	}

	const label = escapeHtml(operatorQr.label ?? 'Domain vault operator QR');
	const domain = escapeHtml(operatorQr.domain);
	const cacheHint = operatorQr.cacheKey
		? `<p class="operator-qr-meta">Cache key: <code>${escapeHtml(operatorQr.cacheKey)}</code></p>`
		: '';

	return `<section class="operator-qr" aria-label="Domain operator QR">
	<h2>Operator Access</h2>
	<p class="operator-qr-warning">Sensitive — encodes the vault master token for <strong>${domain}</strong>. Do not publish or commit this report.</p>
	<figure class="operator-qr-figure">
		<img src="${operatorQr.dataUrl}" alt="Operator QR for ${domain}" width="180" height="180" />
		<figcaption>${label} · ${domain}</figcaption>
	</figure>
	${cacheHint}
</section>`;
}

/**
 * Render a lazy-loading visual gallery for HTML reports.
 */
export function renderVisualGallery(visuals: ReportVisual[]): string {
	if (!visuals.length) {
		return '';
	}

	const items = visuals
		.map(visual => {
			const placeholder = visual.placeholderDataUrl ?? visual.thumbnailPath ?? '';
			const fullSrc =
				visual.normalizedPath ?? visual.imagePath ?? visual.thumbnailPath ?? placeholder;
			if (!placeholder && !fullSrc) {
				return '';
			}

			const label = escapeHtml(visual.label ?? visual.id);
			const initialSrc = placeholder || fullSrc;

			return `<figure class="visual-item">
	<img
		src="${escapeHtml(initialSrc)}"
		data-src="${escapeHtml(fullSrc)}"
		alt="${label}"
		loading="lazy"
		class="visual-lazy"
	/>
	<figcaption>${label}</figcaption>
</figure>`;
		})
		.filter(Boolean)
		.join('\n');

	if (!items) {
		return '';
	}

	return `<section class="visual-gallery">
	<h2>Visual Audit Artifacts</h2>
	<div class="visual-grid">${items}</div>
</section>
<script>
	document.querySelectorAll('img.visual-lazy[data-src]').forEach(img => {
		const full = img.getAttribute('data-src');
		const current = img.getAttribute('src');
		if (!full || !current || full === current) return;
		const loader = new Image();
		loader.onload = () => { img.src = full; };
		loader.src = full;
	});
</script>`;
}