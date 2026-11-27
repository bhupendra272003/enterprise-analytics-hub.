#!/usr/bin/env bash
# Interactive first-user provisioning helper for VyronOS installations.
# Run as root from a local console; creates one account and assigns a single role.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROLE_HELPER="$ROOT/scripts/assign-role.sh"
usage(){ echo "Usage: $0"; exit 2; }
[[ $# -eq 0 ]] || usage
[[ "${VYRON_TEST_MODE:-0}" == "1" || "${EUID}" -eq 0 ]] || { echo "Run this setup as root (e.g. sudo $0)." >&2; exit 1; }
[[ -x "$ROLE_HELPER" || -f "$ROLE_HELPER" ]] || { echo "Role helper missing." >&2; exit 1; }
for g in vyron-users vyron-owner vyron-manager vyron-leader vyron-analyst; do
 getent group "$g" >/dev/null || { echo "Missing group '$g'; run the image group hook first." >&2; exit 1; }
done
read -r -p "New workstation username: " username
[[ "$username" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Invalid username." >&2; exit 1; }
if getent passwd "$username" >/dev/null; then echo "Account already exists; refusing to overwrite." >&2; exit 1; fi
read -r -p "Full name: " fullname
[[ -n "$fullname" ]] || { echo "Full name cannot be empty." >&2; exit 1; }
echo "Choose a local role:"
echo "  1) analyst"
echo "  2) leader"
echo "  3) manager"
echo "  4) owner"
read -r -p "Role [1-4]: " choice
case "$choice" in 1) role=analyst;; 2) role=leader;; 3) role=manager;; 4) role=owner;; *) echo "Invalid role choice." >&2; exit 1;; esac
read -r -p "Create account '$username' ($fullname) as '$role'? [y/N]: " confirm
[[ "$confirm" == [yY] || "$confirm" == [yY][eE][sS] ]] || { echo "Cancelled."; exit 0; }
created=0
cleanup(){
 if [[ "$created" -eq 1 ]]; then
  echo "Provisioning failed; removing incomplete account '$username'." >&2
  userdel -r "$username" 2>/dev/null || userdel "$username" 2>/dev/null || true
 fi
}
trap cleanup ERR
adduser --disabled-password --gecos "$fullname" "$username"
created=1
passwd "$username"
bash "$ROLE_HELPER" "$username" "$role"
created=0
trap - ERR
echo "Account provisioned. Log in as '$username'; password was set interactively."
