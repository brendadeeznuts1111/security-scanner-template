import {encryptText, decryptText, type EncryptedEnvelope} from '../crypto/aes-gcm.ts';

export interface AuditEntry {
	package: string;
	version: string;
	requestedRange: string;
	advisories: Array<{
		level: 'fatal' | 'warn' | 'info';
		package: string;
		version: string;
		url: string | null;
		description: string | null;
		categories: string[];
	}>;
	allowed: boolean;
	decidedAt: string;
}

/**
 * Append-only encrypted JSONL sink.
 *
 * Each line is an independently encrypted JSON value using AES-GCM, so:
 * - Corruption of one line does not prevent reading the rest of the log.
 * - Tailing / real-time dashboards can decrypt the last line without loading the whole file.
 * - Plaintext never touches the disk.
 */
export class EncryptedJSONLSink<T = unknown> {
	constructor(
		private filePath: string,
		private masterKey: string,
	) {}

	/**
	 * Append a single JSON-serializable value to the encrypted JSONL file.
	 */
	async append(entry: T): Promise<void> {
		const envelope = await encryptText(JSON.stringify(entry), this.masterKey);
		const line = JSON.stringify(envelope) + '\n';

		const file = Bun.file(this.filePath);
		const existing = (await file.exists()) ? await file.text() : '';
		await Bun.write(this.filePath, existing + line);
	}

	/**
	 * Stream decrypted values in insertion order.
	 * Skips lines that fail to decrypt or parse so a corrupted line does not
	 * halt the stream.
	 */
	async *stream(): AsyncGenerator<T> {
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
	async readAll(): Promise<T[]> {
		const entries: T[] = [];
		for await (const entry of this.stream()) {
			entries.push(entry);
		}
		return entries;
	}

	/**
	 * Parse a chunk of JSONL text and yield any complete values found.
	 * Useful for real-time dashboards that tail the encrypted file.
	 */
	async *parseChunk(chunk: string): AsyncGenerator<T> {
		const result = Bun.JSONL.parseChunk(chunk);
		for (const value of result.values) {
			const entry = await this.tryDecryptEnvelope(value as EncryptedEnvelope);
			if (entry) {
				yield entry;
			}
		}
	}

	private async tryDecryptLine(line: string): Promise<T | null> {
		let envelope: EncryptedEnvelope;
		try {
			envelope = JSON.parse(line) as EncryptedEnvelope;
		} catch {
			return null;
		}
		return this.tryDecryptEnvelope(envelope);
	}

	private async tryDecryptEnvelope(envelope: EncryptedEnvelope): Promise<T | null> {
		try {
			const plaintext = await decryptText(envelope, this.masterKey);
			return JSON.parse(plaintext) as T;
		} catch {
			return null;
		}
	}
}

/** Convenience alias for an encrypted JSONL sink of audit decisions. */
export type AuditSink = EncryptedJSONLSink<AuditEntry>;
