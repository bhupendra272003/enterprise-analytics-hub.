#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
checker="$ROOT/scripts/check-security-posture.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/ufw" <<'MOCK'
#!/bin/bash
echo "Status: active"
echo "Default: deny (incoming), allow (outgoing), disabled (routed)"
MOCK
cat > "$tmp/bin/systemctl" <<'MOCK'
#!/bin/bash
[[ "$3" == apparmor || "$3" == auditd || "$3" == unattended-upgrades ]]
MOCK
cat > "$tmp/bin/sshd" <<'MOCK'
#!/bin/bash
echo "permitrootlogin no"
MOCK
cat > "$tmp/bin/aa-status" <<'MOCK'
#!/bin/bash
exit 0
MOCK
chmod +x "$tmp/bin/"*
out="$(PATH="$tmp/bin:$PATH" bash "$checker")"
grep -q '\[PASS\] UFW active' <<<"$out"
grep -q '\[PASS\] UFW incoming default deny' <<<"$out"
grep -q '\[PASS\] apparmor active' <<<"$out"
grep -q '\[PASS\] auditd active' <<<"$out"
grep -q '\[PASS\] unattended-upgrades active' <<<"$out"
grep -q '\[PASS\] effective SSH root login disabled' <<<"$out"
grep -q '\[PASS\] AppArmor enabled' <<<"$out"
grep -q 'Warnings: 0' <<<"$out"
# A degraded posture should report warnings, never attempt to remediate.
cat > "$tmp/bin/ufw" <<'MOCK'
#!/bin/bash
echo "Status: inactive"
MOCK
cat > "$tmp/bin/systemctl" <<'MOCK'
#!/bin/bash
exit 1
MOCK
cat > "$tmp/bin/sshd" <<'MOCK'
#!/bin/bash
echo "permitrootlogin yes"
MOCK
out="$(PATH="$tmp/bin:$PATH" bash "$checker")"
grep -q '\[WARN\] UFW inactive' <<<"$out"
grep -q '\[WARN\] apparmor inactive' <<<"$out"
grep -q '\[WARN\] effective SSH root-login policy not confirmed' <<<"$out"
grep -q 'Warnings: ' <<<"$out"
echo "Security posture checker mock regression tests passed."

# Missing systemctl must degrade to explicit warnings, not command-not-found errors.
rm -f "$tmp/bin/systemctl"
out="$(PATH="$tmp/bin:/usr/bin:/bin" bash "$checker" 2>&1)"
grep -q '\[WARN\] systemctl unavailable; cannot verify apparmor' <<<"$out" || {
  # On hosts where systemctl is available in /usr/bin, skip this PATH-specific assertion.
  if command -v systemctl >/dev/null 2>&1; then :; else exit 1; fi
}
