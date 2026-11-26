#!/usr/bin/env bash
# Read-only preflight for the VyronOS image-building host.
set -euo pipefail
MIN_FREE_GB="${VYRON_MIN_FREE_GB:-30}"
BUILD_DIR="${VYRON_BUILD_DIR:-$PWD}"
errors=0
warnings=0
say(){ printf '%s\n' "$*"; }
fail(){ say "ERROR: $*"; errors=$((errors+1)); }
warn(){ say "WARN: $*"; warnings=$((warnings+1)); }
if [[ ! -r /etc/os-release ]]; then fail "/etc/os-release unavailable"; else
 . /etc/os-release
 if [[ "${ID:-}" != ubuntu ]]; then fail "Ubuntu build host required (detected ${PRETTY_NAME:-unknown})"; fi
 if [[ "${VERSION_ID:-}" != 24.04 ]]; then fail "Ubuntu 24.04 host required (detected ${VERSION_ID:-unknown})"; fi
fi
for tool in lb xorriso debootstrap mksquashfs rsync grub-mkrescue; do
 command -v "$tool" >/dev/null 2>&1 || fail "missing tool: $tool"
done
if [[ "$EUID" -eq 0 ]]; then warn "Run the build orchestrator as an unprivileged user; sudo is for host preparation only."; fi
if [[ ! -d "$BUILD_DIR" ]]; then warn "Build directory does not exist yet: $BUILD_DIR"; fi
if [[ -d "$BUILD_DIR" ]]; then
 avail_kb="$(df -Pk "$BUILD_DIR" | awk 'NR==2 {print $4}')"
 avail_gb=$((avail_kb / 1024 / 1024))
 if (( avail_gb < MIN_FREE_GB )); then fail "Only ${avail_gb} GiB free; need at least ${MIN_FREE_GB} GiB"; else say "Free space: ${avail_gb} GiB (threshold ${MIN_FREE_GB} GiB)"; fi
fi
if command -v apt-cache >/dev/null 2>&1; then
 for pkg in live-build xorriso debootstrap squashfs-tools grub-pc-bin grub-efi-amd64-bin; do
  policy="$(apt-cache policy "$pkg" 2>/dev/null || true)"
  if [[ "$policy" == *"Candidate: (none)"* ]]; then warn "No package candidate in host cache: $pkg"; fi
 done
fi
say "Errors: $errors; warnings: $warnings"
if (( errors > 0 )); then exit 1; fi
say "Builder-host preflight passed. This is not an ISO build or VM test."
