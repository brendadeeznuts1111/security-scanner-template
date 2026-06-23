/**
 * Preloaded before every `bun test` run (see bunfig.toml `[test].preload`).
 * @see https://bun.com/reference/bun/test
 * @see https://bun.com/docs/test/lifecycle
 * @see https://bun.com/docs/guides/test/migrate-from-jest
 */
import {setupEnvCleanup, setupTimeCleanup} from './helpers.ts';

// bun:test defaults to UTC; pin so Intl formatting is stable across hosts.
process.env.TZ = 'UTC';

setupEnvCleanup();
setupTimeCleanup();