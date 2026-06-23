export type ImageFormat = 'jpeg' | 'png' | 'webp';

export type ImageSource = string | ArrayBuffer | Uint8Array | Blob | Bun.BunFile;

/** Matches native `Bun.Image.resize` options. */
export type ResizeOptions = NonNullable<Parameters<Bun.Image['resize']>[2]>;

export interface EncodeOptions {
	format?: ImageFormat;
	quality?: number;
}

export interface ThumbnailOptions extends EncodeOptions {
	width?: number;
	height?: number;
	resize?: ResizeOptions;
}

export interface ThumbnailResult {
	image: Bun.Image;
	metadata: Awaited<ReturnType<Bun.Image['metadata']>>;
}
