#!/usr/bin/env bash
set -euo pipefail
ISO="${1:-}"
if [[ -z "$ISO" ]]; then echo "Usage: $0 /path/to/VyronOS.iso" >&2; exit 2; fi
[[ -f "$ISO" ]] || { echo "ERROR: ISO file does not exist"; exit 1; }
size="$(stat -c '%s' "$ISO")"
(( size > 500000000 )) || { echo "WARN: ISO under 500 MB; expected size may vary with package selection."; }
echo "File: $ISO"
echo "Size bytes: $size"
sha256sum "$ISO"
if command -v xorriso >/dev/null 2>&1; then
 echo "Inspecting ISO filesystem:"
 xorriso -indev "$ISO" -report_el_torito as_mkisofs 2>&1 | sed -n '1,100p'
else echo "WARN: xorriso unavailable; skipping El Torito inspection"; fi
if command -v qemu-system-x86_64 >/dev/null 2>&1; then
 echo "QEMU found. Manual boot test command:"
 echo "qemu-system-x86_64 -m 4096 -smp 2 -cdrom \"$ISO\" -boot d"
else echo "QEMU not installed. Boot test still requires a VM or physical test machine."; fi
echo "Static ISO inspection completed; this does not verify successful boot or installer operation."
