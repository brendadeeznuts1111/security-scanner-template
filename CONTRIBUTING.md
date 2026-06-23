# Contributing

This is a template repository. Contributions are welcome, but most users will
want to fork this repository and customize it for their organization's security
requirements.

## Development

Requires **Bun >= 1.3.14** (`engines.bun` in `package.json`).

Install dependencies:

```bash
bun install
```

Run the quality gates:

```bash
bun run check
```

This runs Prettier, TypeScript typechecking, and the full test suite. Tests
enable all compile-time feature flags (`AUDIT_JSONL`, `AUDIT_SQLITE`,
`SCAN_EXTERNAL`, etc.) so optional subsystems are exercised in CI.

### Domain and vault workflow

When changing domain loading, audit, vault, or operator CLI behavior:

1. Edit or add a fixture under `domains/*.security.json5` (or extend
   `templates/domain.template.json5` for new fields).
2. Run the config doctor:

   ```bash
   bun sp doctor --json
   bun sp doctor --matrix
   ```

3. For audit changes, set a test key:

   ```bash
   export AUDIT_MASTER_KEY=test-key-for-local-dev-only
   ```

4. Smoke the interactive shell (non-interactive commands only in CI):

   ```bash
   bun sp doctor --benchmark --root .
   bun run bench --suite doctor --json
   bun run matrix --template
   bun run xref
   ```

### Naming conventions

Enforced by `bun sp doctor` and `tests/conventions/test-naming.test.ts`:

| Artifact                | Pattern                                                               | Example                                 |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| Domain config file      | `domains/<domain>.security.json5`                                     | `com.example.app.security.json5`        |
| `domain` field          | Reverse-DNS                                                           | `com.example.app`                       |
| Secret inventory `name` | kebab-case                                                            | `threat-feed-api-key`                   |
| Test file               | `tests/**/*.test.ts`                                                  | `tests/config/doctor.test.ts`           |
| Test description        | Lowercase lead; no `Should` prefix; CLI tests may start with `--flag` | `checkDomain reports invalid hex color` |

Inspect alignment defaults and enum options: `bun run matrix --template --alignment`.

### Feature flags

Optional code paths are gated by compile-time features (see `src/features/index.ts`).
Inspect active flags: `bun run flags` or `features` inside `bun sp shell`.
The default `bun test` script passes `--feature=<NAME>` for every flag.

To test a single feature in isolation:

```bash
bun test --feature=AUDIT_JSONL tests/audit/
```

Runtime overrides use `FEATURE_<NAME>=true|false` (e.g.
`FEATURE_SCAN_EXTERNAL=false bun sp scan --domain …`).

Build profiles (`agent`, `server`, `dev`) map to feature sets in
`src/build/profiles.ts`. Verify bundle output with:

```bash
bun run build:bundle -- --profile agent --outdir /tmp/sp-bundle
```

### Staging related changes

For large WIP trees, `scripts/stage-commit-groups.sh` groups files into logical
commits (domain, audit, CLI, tests, etc.). Review the script before use — it is
a maintainer helper, not part of the published package API.

## Pull Requests

1. Fork the repository.
2. Create a feature branch.
3. Make your changes with tests.
4. Ensure `bun run check` passes.
5. For operator/CLI changes, include doctor or bench smoke output in the PR
   description when behavior is user-visible.
6. Submit a pull request with a clear description of the change.
