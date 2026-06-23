#!/usr/bin/env bash
set -euo pipefail

# This script verifies that Bun actually invokes the scanner during `bun install`.
# It expects a non-zero exit code for both fatal and warn scenarios because:
# - fatal advisories always block installation
# - warn advisories block installation in non-TTY environments

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_DIR="$(dirname "$SCRIPT_DIR")"

function info() {
	echo "\033[1;34m[INFO]\033[0m $1"
}

function error() {
	echo "\033[1;31m[ERROR]\033[0m $1"
}

function success() {
	echo "\033[1;32m[PASS]\033[0m $1"
}

# Link the scanner from the parent directory so the test projects can consume it.
info "Linking scanner from $SCANNER_DIR"
cd "$SCANNER_DIR"
bun link

function run_test() {
	local name="$1"
	local dir="$SCRIPT_DIR/$name"
	local expected_exit="$2"

	info "Running $name integration test"
	cd "$dir"

	info "Linking scanner into $dir"
	bun link @acme/bun-security-scanner

	info "Running bun install with THREAT_FEED_PATH=$dir/rules.json"
	set +e
	THREAT_FEED_PATH="$dir/rules.json" bun install >install.log 2>&1
	local exit_code=$?
	set -e

	if [ "$exit_code" -eq "$expected_exit" ]; then
		success "$name: bun install exited with $exit_code (expected $expected_exit)"
	else
		error "$name: bun install exited with $exit_code, expected $expected_exit"
		echo "--- install.log ---"
		cat "$dir/install.log"
		exit 1
	fi

	if grep -q "$name" "$dir/install.log"; then
		success "$name: scanner output contains package name"
	else
		error "$name: scanner output does not contain package name"
		echo "--- install.log ---"
		cat "$dir/install.log"
		exit 1
	fi
}

# Fatal advisories should always fail the install.
run_test "fatal" 1

# Warn advisories should fail the install in non-TTY environments.
run_test "warn" 1

success "All integration tests passed"
