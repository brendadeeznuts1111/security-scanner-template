# Integration Tests

These tests verify that Bun actually invokes the security scanner during `bun install`.

## Scenarios

- **`fatal/`**: A package is marked as `malware`. `bun install` should exit with a non-zero code.
- **`warn/`**: A package is marked as `deprecated`. In a non-TTY environment, `bun install` should exit with a non-zero code.

## Running

From the repository root:

```bash
./integration-test/run.sh
```

The script will:

1. Link the scanner from the parent directory (`bun link`).
2. Link the scanner into each test project.
3. Run `bun install` with a custom `THREAT_FEED_PATH` for each scenario.
4. Assert the expected exit code and scanner output.

## Requirements

- `bun` >= 1.2.0
- Network access to fetch the real test packages (`event-stream`, `is-odd`).

## Cleanup

The script leaves `install.log` files in each scenario directory for inspection.
