import path from 'path';
import {mkdir} from 'fs/promises';
import type {DomainConfig} from '../config/types.ts';
import {toRgbaObject} from '../color/index.ts';
import {solidPng} from './png-solid.ts';

export interface DomainBadgeOptions {
	size?: number;
	outDir?: string;
}

interface BunImageHandle {
	resize(width: number, height: number): BunImageHandle;
	write(filePath: string): Promise<void>;
}

const DEFAULT_SIZE = 48;
const DEFAULT_OUT_DIR = '.security/badges';

function openBunImage(input: string): BunImageHandle {
	const ctor = (Bun as unknown as {Image: new (path: string) => BunImageHandle}).Image;
	return new ctor(input);
}

function rgbaFromHex(hex: string): {r: number; g: number; b: number} {
	const rgba = toRgbaObject(hex);
	if (!rgba) {
		return {r: 10, g: 132, b: 255};
	}
	return {r: rgba.r, g: rgba.g, b: rgba.b};
}

function badgeFileName(domain: string): string {
	const safe = domain.replace(/[^a-zA-Z0-9.-]+/g, '_');
	return `${safe}.png`;
}

/**
 * Write a solid-color domain badge PNG tinted from `colors.primary` (Bun.color).
 */
export async function writeDomainBadge(
	config: DomainConfig,
	options: DomainBadgeOptions = {},
): Promise<string> {
	const size = options.size ?? DEFAULT_SIZE;
	const outDir = options.outDir ?? DEFAULT_OUT_DIR;
	const {r, g, b} = rgbaFromHex(config.colors.primary);

	await mkdir(outDir, {recursive: true});
	const outPath = path.join(outDir, badgeFileName(config.domain));
	const bytes = solidPng(size, size, r, g, b);
	await Bun.write(outPath, bytes);
	return outPath;
}

/**
 * Resize an on-disk badge or brand asset via Bun.Image.
 */
export async function resizeBadgeAsset(
	inputPath: string,
	outputPath: string,
	size: number,
): Promise<void> {
	const image = openBunImage(inputPath);
	image.resize(size, size);
	await image.write(outputPath);
}

export function describeBadge(config: DomainConfig, badgePath: string, size: number): string {
	const name = config.displayName ?? config.domain;
	return `${name} badge ${size}x${size} → ${badgePath}`;
}