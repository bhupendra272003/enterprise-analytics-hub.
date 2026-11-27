#!/usr/bin/env bash
# Guarded Ubuntu ISO customization wrapper around livefs-editor.
# Requires a user-supplied official ISO, isolated builder and reviewed package/action YAML.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage(){ echo "Usage: sudo $0 SOURCE.iso DEST.iso ACTIONS.yaml"; }
[[ $# -eq 3 ]] || { usage >&2; exit 2; }
SOURCE="$(realpath "$1")"; DEST="$(realpath -m "$2")"; ACTIONS="$(realpath "$3")"
MIN_FREE_GB="${VYRON_CUSTOMIZE_MIN_FREE_GB:-100}"
if [[ ! "$MIN_FREE_GB" =~ ^[1-9][0-9]*$ ]]; then
 echo "ERROR: VYRON_CUSTOMIZE_MIN_FREE_GB must be a positive whole number of GiB" >&2
 exit 2
fi
[[ -f "$SOURCE" && -r "$SOURCE" ]] || { echo "ERROR: source ISO unreadable" >&2; exit 1; }
[[ -f "$ACTIONS" && -r "$ACTIONS" ]] || { echo "ERROR: action YAML unreadable" >&2; exit 1; }
[[ "$SOURCE" != "$DEST" ]] || { echo "ERROR: destination must differ from source" >&2; exit 1; }
[[ ! -e "$DEST" ]] || { echo "ERROR: destination already exists; refusing overwrite" >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || { echo "ERROR: livefs-edit requires root; run in an isolated builder VM" >&2; exit 1; }
command -v livefs-edit >/dev/null || { echo "ERROR: livefs-edit missing; install per Ubuntu image-cookbook instructions" >&2; exit 1; }
command -v xorriso >/dev/null && command -v mksquashfs >/dev/null || { echo "ERROR: xorriso and mksquashfs required" >&2; exit 1; }
free_kb="$(df -Pk "$(dirname "$DEST")" | awk 'NR==2 {print $4}')"
free_gb=$((free_kb/1024/1024))
if (( free_gb < MIN_FREE_GB )); then echo "ERROR: at least ${MIN_FREE_GB} GiB free required for this guarded pipeline; found ${free_gb} GiB" >&2; exit 1; fi
echo "Source ISO SHA256:"
sha256sum "$SOURCE"
echo "WARNING: verify source ISO checksum/signature against official Ubuntu publication before proceeding."
echo "WARNING: LiveFS Editor primarily targets Ubuntu live/server installer images; desktop ISO compatibility is not assured."
echo "Review the action YAML carefully. A test output is not a release image until VM-validated."
echo "Action YAML is user-reviewed and executes installer filesystem modifications."
read -r -p "Type CUSTOMIZE to continue: " confirm
[[ "$confirm" == "CUSTOMIZE" ]] || { echo "Cancelled."; exit 1; }
mkdir -p "$(dirname "$DEST")"
livefs-edit "$SOURCE" "$DEST" --action-yaml "$ACTIONS"
[[ -s "$DEST" ]] || { echo "ERROR: output ISO not created" >&2; exit 1; }
echo "Output ISO SHA256:"
sha256sum "$DEST"
echo "Output ISO created. File inspection and VM tests are mandatory before distribution."
