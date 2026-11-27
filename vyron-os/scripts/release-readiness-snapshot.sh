#!/usr/bin/env bash
# Read-only release gate snapshot; intentionally never certifies release readiness.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${VYRON_BUILD_DIR:-$PWD}"
SOURCE_ISO="${VYRON_SOURCE_ISO:-}"
checks=0; passed=0; blocked=0; warned=0
report="${VYRON_READINESS_REPORT:-}"
emit(){ printf '%s\n' "$*" ; if [[ -n "$report" ]]; then printf '%s\n' "$*" >> "$report"; fi; }
warn(){ warned=$((warned+1)); emit "WARN: $*"; }
if [[ -n "$report" ]]; then mkdir -p "$(dirname "$report")"; : > "$report"; fi
emit "VyronOS readiness snapshot (not release certification)"
emit "Branch/commit context: $(git -C "$ROOT/.." rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown) / $(git -C "$ROOT/.." rev-parse HEAD 2>/dev/null || echo unknown)"
for tool in sha256sum xorriso mksquashfs livefs-edit qemu-system-x86_64; do
 if command -v "$tool" >/dev/null 2>&1; then passed=$((passed+1)); emit "PASS: tool available: $tool"; else blocked=$((blocked+1)); emit "BLOCKED: missing tool: $tool"; fi
 checks=$((checks+1))
done
if [[ -n "$SOURCE_ISO" ]]; then
 if [[ -r "$SOURCE_ISO" && -s "$SOURCE_ISO" ]]; then passed=$((passed+1)); emit "PASS: source ISO readable"; else blocked=$((blocked+1)); emit "BLOCKED: source ISO unreadable or empty"; fi
 checks=$((checks+1))
else warn "Source ISO not supplied (set VYRON_SOURCE_ISO)."; fi
if [[ -d "$BUILD_DIR" ]]; then
 free_kb="$(df -Pk "$BUILD_DIR" | awk 'NR==2 {print $4}')"; free_gb=$((free_kb/1024/1024))
 if (( free_gb >= 100 )); then emit "PASS: storage ${free_gb} GiB free (100 GiB target)"; passed=$((passed+1)); else emit "BLOCKED: storage ${free_gb} GiB free; target >=100 GiB"; blocked=$((blocked+1)); fi
 checks=$((checks+1))
else warn "Build directory absent; storage test skipped."; fi
emit "Summary: checks=$checks passed=$passed blocked=$blocked warnings=$warned"
emit "This snapshot cannot prove source authenticity, ISO bootability, installer operation, or VM validation."
(( blocked == 0 )) || exit 1
