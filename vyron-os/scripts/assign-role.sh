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
role_groups=(vyron-owner vyron-manager vyron-leader vyron-analyst)
if [[ $dry -eq 1 ]]; then
 echo "DRY RUN: target account '$user', role '$role' ($group), common group vyron-users"
 echo "DRY RUN: check for conflicting existing Vyron role membership before changing groups"
 exit 0
fi
[[ $EUID -eq 0 ]] || { echo "Run as root (e.g. sudo)." >&2; exit 1; }
id "$user" >/dev/null 2>&1 || { echo "Account '$user' does not exist; refusing to create it." >&2; exit 1; }
getent group "$group" >/dev/null || { echo "Required group '$group' missing." >&2; exit 1; }
getent group vyron-users >/dev/null || { echo "Required group vyron-users missing." >&2; exit 1; }
current_groups="$(id -nG "$user")"
for existing in "${role_groups[@]}"; do
  if grep -qw "$existing" <<<"$current_groups" && [[ "$existing" != "$group" ]]; then
    echo "Account '$user' already belongs to role group '$existing'; refusing multi-role assignment." >&2
    echo "Review and resolve the existing role manually before retrying." >&2
    exit 1
  fi
done
usermod -aG vyron-users "$user"
usermod -aG "$group" "$user"
echo "Assigned '$user' to VyronOS role group '$group' (plus vyron-users)."
echo "Note: this only configures local group membership; app RBAC remains separate."
