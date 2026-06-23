#!/usr/bin/env bash
# Stage and commit the template expansion in logical groups.
# Usage: ./scripts/stage-commit-groups.sh [group-number|all]
set -euo pipefail
cd "$(dirname "$0")/.."

commit_group() {
  local n="$1" msg="$2"
  shift 2
  echo "=== Group $n: $msg ==="
  git add "$@"
  if git diff --cached --quiet; then
    echo "  (nothing to stage — skipping)"
    return 0
  fi
  git diff --cached --stat
  git commit -m "$msg"
  echo
}

case "${1:-all}" in
  1)
    commit_group 1 "feat(audit): SQLite + JSONL sinks, factory, and encrypted persistence" \
      src/audit/ tests/audit/
    ;;
  2)
    commit_group 2 "feat(config): doctor, vault, registry, drift, TOML, and master-key" \
      src/config/ src/cli/config-doctor.ts src/cli/doctor.ts src/cli/master-key.ts src/cli/vault-commands.ts \
      src/domains/vault.ts src/domains/registry.ts src/domain/ src/registry/ src/policy/loader.ts \
      scripts/migrate-vault.ts \
      tests/config/ tests/domain/ tests/domain-runtime/vault.test.ts tests/domain-runtime/registry.test.ts \
      tests/scripts/migrate-vault.test.ts tests/registry/ tests/policy/loader.test.ts
    ;;
  3)
    commit_group 3 "feat(intel): TLS system CA, SQLite pragmas, and DNS threat intel" \
      src/intel/ src/threat-intel/ src/cli/tls.ts \
      tests/intel/ tests/threat-intel/ tests/cli/tls.test.ts
    ;;
  4)
    commit_group 4 "feat(scan): workers, terminal/process IO, and interactive session guards" \
      src/scan/ src/interactive/ src/utils/ \
      tests/scan/ tests/interactive/ tests/utils/ tests/shell/
    ;;
  5)
    commit_group 5 "feat(report): operator QR, enrich pipeline, visuals, and webview" \
      src/report/ src/visual/ src/cli/qr.ts src/cli/visual.ts src/cli/report.ts src/cli/formatters.ts src/cli/watch.ts \
      tests/report/ tests/visual/ tests/cli/qr.test.ts tests/image/ tests/interactive/shell-qr.test.ts tests/cli/watch.test.ts
    ;;
  6)
    commit_group 6 "feat(supply-chain): peer-deps meta, feeds, cache, and semver matcher" \
      src/supply-chain/ src/provider/ src/domains/supply-chain.ts \
      tests/supply-chain/ tests/provider/ tests/domain-runtime/supply-chain.test.ts tests/cli/doctor-peer-meta.test.ts
    ;;
  7)
    commit_group 7 "feat(cli): sp, scan, xref, csrf, build commands and domain templates" \
      src/cli/sp.ts src/cli/scan.ts src/cli/xref.ts src/cli/csrf.ts src/cli/build.ts \
      src/domains/csrf.ts src/domains/identity.ts src/csrf/ src/identity/ \
      domains/com.factory-wager.shadow.security.json5 domains/com.factory-wager.telegram.security.json5 domains/com.factory-wager.toolchain.security.json5 \
      templates/domain.template.json5 \
      tests/cli/csrf.test.ts tests/domain-runtime/csrf.test.ts tests/domain-runtime/identity.test.ts \
      tests/csrf/ tests/xref/ tests/build/
    ;;
  8)
    commit_group 8 "feat(build): security plugin, crypto, compression, and net helpers" \
      src/build/ src/crypto/ src/compression/ src/net/ \
      tests/crypto/ tests/network/
    ;;
  9)
    commit_group 9 "chore: shared features, service layer, and package wiring" \
      src/features/ src/color/ src/image/ src/integrity/ src/xref/ src/semver/ src/service/ \
      src/index.ts src/types/ \
      package.json bun.lock bunfig.toml tsconfig.json .gitignore \
      tests/features/ tests/color/ tests/semver/ tests/service/ tests/xref/ tests/integrity/ \
      tests/cli/healthcheck.test.ts tests/cli/formatters.test.ts
    ;;
  all)
    "$0" 1 && "$0" 2 && "$0" 3 && "$0" 4 && "$0" 5 && "$0" 6 && "$0" 7 && "$0" 8 && "$0" 9
    echo "Done — 9 commits on $(git branch --show-current)"
    git log --oneline -9
    ;;
  *)
    echo "Usage: $0 [1-9|all]" >&2
    exit 1
    ;;
esac