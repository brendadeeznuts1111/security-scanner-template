import {encryptText, decryptText, type EncryptedEnvelope} from '../crypto/aes-gcm.ts';
import {compressText, decompressText} from '../compression/codec.ts';
import type {AuditEntry, AuditSink, AuditSinkOptions} from './types.ts';

export type {AuditEntry} from './types.ts';

/**
 * Append-only encrypted JSONL sink.
 *
 * Each line is an independently encrypted JSON value using AES-GCM, so:
 * - Corruption of one line does not prevent reading the rest of the log.
 * - Tailing / real-time dashboards can decrypt the last line without loading the whole file.
 * - Plaintext never touches the disk.
 */
export class EncryptedJSONLSink implements AuditSink {
	private readonly compress: boolean;
	private readonly compressionFormat: 'gzip' | 'zstd';

	constructor(
		private filePath: string,
		private masterKey: string,
		options: AuditSinkOptions = {},
	) {
		this.compress = options.compress ?? false;
		this.compressionFormat = options.compressionFormat ?? 'gzip';
	}

	/**
	 * Append a single audit entry to the encrypted JSONL file.
	 */
	async append(entry: AuditEntry): Promise<void> {
		const envelope = await encryptText(JSON.stringify(entry), this.masterKey);
		const serialized = JSON.stringify(envelope);
		const payload = this.compress
			? compressText(serialized, this.compressionFormat)
			: new TextEncoder().encode(serialized);
		const line = Buffer.from(payload).toString('base64') + '\n';

		const file = Bun.file(this.filePath);
		const existing = (await file.exists()) ? await file.text() : '';
		await Bun.write(this.filePath, existing + line);
	}

	/**
	 * Stream decrypted values in insertion order.
	 * Skips lines that fail to decrypt or parse so a corrupted line does not
	 * halt the stream.
	 */
	async *stream(): AsyncGenerator<AuditEntry> {
		const file = Bun.file(this.filePath);
		if (!(await file.exists())) return;

		const text = await file.text();
		const lines = text.split('\n').filter(line => line.trim().length > 0);

		for (const line of lines) {
			const entry = await this.tryDecryptLine(line);
			if (entry) {
				yield entry;
			}
		}
	}

	/**
	 * Read all decrypted values into memory.
	 */
	async readAll(): Promise<AuditEntry[]> {
		const entries: AuditEntry[] = [];
		for await (const entry of this.stream()) {
			entries.push(entry);
		}
		return entries;
	}

	/**
	 * Parse a chunk of JSONL text and yield any complete values found.
	 * Useful for real-time dashboards that tail the encrypted file.
	 */
	async *parseChunk(chunk: string): AsyncGenerator<AuditEntry> {
		const lines = chunk.split('\n').filter(line => line.trim().length > 0);
		for (const line of lines) {
			const entry = await this.tryDecryptLine(line);
			if (entry) {
				yield entry;
			}
		}
	}

	private async tryDecryptLine(line: string): Promise<AuditEntry | null> {
		const trimmed = line.trim();
		if (trimmed.startsWith('{')) {
			try {
				return this.tryDecryptEnvelope(JSON.parse(trimmed) as EncryptedEnvelope);
			} catch {
				return null;
			}
		}

		try {
			const bytes = Buffer.from(trimmed, 'base64');
			const json = this.compress ? decompressText(bytes) : new TextDecoder().decode(bytes);
			return this.tryDecryptEnvelope(JSON.parse(json) as EncryptedEnvelope);
		} catch {
			return null;
		}
	}

	private async tryDecryptEnvelope(envelope: EncryptedEnvelope): Promise<AuditEntry | null> {
		try {
			const plaintext = await decryptText(envelope, this.masterKey);
			return JSON.parse(plaintext) as AuditEntry;
		} catch {
			return null;
		}
	}
}
