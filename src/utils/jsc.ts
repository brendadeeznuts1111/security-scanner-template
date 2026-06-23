import {deserialize, serialize} from 'bun:jsc';

/**
 * Serialize a value with the structured-clone algorithm (bun:jsc).
 */
export function serializeStructured(value: unknown): ArrayBufferLike {
	return serialize(value) as ArrayBufferLike;
}

/**
 * Deserialize a structured-clone buffer produced by serializeStructured.
 */
export function deserializeStructured(buffer: ArrayBufferLike): unknown {
	return deserialize(buffer);
}

/**
 * Deep-clone a structured-cloneable value without JSON round-tripping.
 */
export function cloneStructured<T>(value: T): T {
	return deserializeStructured(serializeStructured(value)) as T;
}
