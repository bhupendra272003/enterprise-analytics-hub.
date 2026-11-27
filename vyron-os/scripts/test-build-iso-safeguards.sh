#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_script="$ROOT/scripts/build-iso.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/lb" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${LB_LOG:?}"
if [[ "$1" == config ]]; then exit 0; fi
if [[ "$1" == build ]]; then printf "mock ISO\n" > "${LB_OUTPUT:?}"; exit 0; fi
MOCK
chmod +x "$tmp/bin/lb"
export PATH="$tmp/bin:$PATH" LB_LOG="$tmp/lb.log" LB_OUTPUT="$tmp/build/binary.iso"
# Default path must block prototype and not invoke lb.
if VYRON_BUILD_DIR="$tmp/blocked" bash "$build_script" >"$tmp/blocked.out" 2>&1; then
 echo "ERROR: prototype unexpectedly allowed by default"; exit 1
fi
grep -q 'BLOCKED: generic live-build prototype' "$tmp/blocked.out"
[[ ! -s "$LB_LOG" ]] || { echo "ERROR: lb invoked while blocked"; exit 1; }
# Explicit opt-in with isolated build dir must configure/build mocked scaffold.
VYRON_ALLOW_EXPERIMENTAL_LB=1 VYRON_BUILD_DIR="$tmp/build" bash "$build_script"
grep -q -- '--distribution noble' "$LB_LOG"
grep -q -- '--debian-installer false' "$LB_LOG"
[[ -s "$LB_OUTPUT" ]] || { echo "ERROR: mocked build output missing"; exit 1; }
# Existing build directory must be refused, no overwrite.
if VYRON_ALLOW_EXPERIMENTAL_LB=1 VYRON_BUILD_DIR="$tmp/build" bash "$build_script" >"$tmp/reuse.out" 2>&1; then
 echo "ERROR: existing build directory accepted"; exit 1
fi
grep -q 'Build directory already exists' "$tmp/reuse.out"
echo "Build ISO prototype safeguard tests passed."
