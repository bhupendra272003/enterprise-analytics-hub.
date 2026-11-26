#!/usr/bin/env bash
# Safely assign a VyronOS local role to an existing individual Linux account.
# This utility does not create accounts, passwords, sudo rules, or application permissions.
set -euo pipefail
usage(){ echo "Usage: $0 [--dry-run] USER ROLE (owner|manager|leader|analyst)" >&2; exit 2; }
dry=0
if [[ "${1:-}" == "--dry-run" ]]; then dry=1; shift; fi
[[ $# -eq 2 ]] || usage
user="$1"; role="$2"
[[ "$user" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]] || { echo "Invalid username syntax" >&2; exit 1; }
case "$role" in
 owner) group=vyron-owner ;;
 manager) group=vyron-manager ;;
 leader) group=vyron-leader ;;
 analyst) group=vyron-analyst ;;
 *) usage ;;
esac
if [[ $dry -eq 1 ]]; then
 echo "DRY RUN: add account '$user' to group '$group' and common group vyron-users"
 exit 0
fi
[[ $EUID -eq 0 ]] || { echo "Run as root (e.g. sudo)." >&2; exit 1; }
id "$user" >/dev/null 2>&1 || { echo "Account '$user' does not exist; refusing to create it." >&2; exit 1; }
getent group "$group" >/dev/null || { echo "Required group '$group' missing." >&2; exit 1; }
getent group vyron-users >/dev/null || { echo "Required group vyron-users missing." >&2; exit 1; }
usermod -aG vyron-users "$user"
usermod -aG "$group" "$user"
echo "Assigned '$user' to VyronOS role group '$group' (plus vyron-users)."
echo "Note: this only configures local group membership; app RBAC remains separate."
