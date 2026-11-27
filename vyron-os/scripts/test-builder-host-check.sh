#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/builder-host-check.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mockbin="$tmp/bin"
mkdir -p "$mockbin"
printf 'ID=ubuntu\nVERSION_ID="24.04"\nVERSION_CODENAME=noble\nPRETTY_NAME="Ubuntu 24.04 LTS"\n' > "$tmp/os-release"
for tool in lb xorriso debootstrap mksquashfs rsync grub-mkrescue; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$mockbin/$tool"
  chmod +x "$mockbin/$tool"
done
cat > "$mockbin/df" <<'DF'
#!/usr/bin/env bash
printf 'Filesystem  1024-blocks  Used Available Capacity Mounted on\n'
printf '/dev/mock   200000000   1   %s  1%% /mock\n' "${MOCK_FREE_KB:-125829120}"
DF
chmod +x "$mockbin/df"
cat > "$mockbin/apt-cache" <<'APT'
#!/usr/bin/env bash
printf 'Package: %s\nCandidate: 1.0\n' "$2"
APT
chmod +x "$mockbin/apt-cache"
export PATH="$mockbin:$PATH" VYRON_OS_RELEASE_FILE="$tmp/os-release" VYRON_BUILD_DIR="$tmp"
# Default threshold must accept 120 GiB.
MOCK_FREE_KB=125829120 "$CHECK" > "$tmp/pass.log"
grep -q 'Builder-host preflight passed' "$tmp/pass.log"
# Default threshold must reject 88 GiB.
if MOCK_FREE_KB=92274688 "$CHECK" > "$tmp/low.log" 2>&1; then
  echo 'ERROR: builder check accepted 88 GiB with its 100 GiB default' >&2
  exit 1
fi
grep -q 'need at least 100 GiB' "$tmp/low.log"
# A non-Ubuntu host must be rejected even when tools and disk are available.
printf 'ID=debian\nVERSION_ID="12"\nPRETTY_NAME="Debian GNU/Linux 12"\n' > "$tmp/os-release"
if MOCK_FREE_KB=125829120 "$CHECK" > "$tmp/os.log" 2>&1; then
  echo 'ERROR: builder check accepted a non-Ubuntu host' >&2
  exit 1
fi
grep -q 'Ubuntu build host required' "$tmp/os.log"
echo 'Builder-host check tests passed (100 GiB default, low-space rejection, OS rejection).'
