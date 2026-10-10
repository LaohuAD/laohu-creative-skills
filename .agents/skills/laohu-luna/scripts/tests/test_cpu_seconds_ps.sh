#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
script="$repo_root/.agents/skills/laohu-luna/scripts/laohu-luna.sh"
mkdir -p "$repo_root/.cache"
test_root="$(mktemp -d "$repo_root/.cache/laohu-luna-cpu-test.XXXXXX")"

cat > "$test_root/ps" <<'SH'
#!/bin/sh
printf '%s\n' "$FAKE_PS_TIME"
SH
chmod +x "$test_root/ps"
PATH="$test_root:$PATH"
export PATH
source "$script"
trap 'rm -rf "$test_root"' EXIT

assert_time() {
    local sample="$1" expected="$2" actual
    FAKE_PS_TIME="$sample"
    export FAKE_PS_TIME
    actual="$(cpu_seconds_ps 42)"
    [[ "$actual" == "$expected" ]] || { echo "FAIL: $sample -> $actual; expected $expected" >&2; exit 1; }
}

assert_invalid() {
    FAKE_PS_TIME="$1"
    export FAKE_PS_TIME
    if cpu_seconds_ps 42 >/dev/null 2>&1; then
        echo "FAIL: accepted unknown ps time format: $1" >&2
        exit 1
    fi
}

assert_time '01:23.45' 83
assert_time '02:03:04' 7384
assert_time '1-02:03:04' 93784
assert_invalid 'unknown'
echo 'cpu_seconds_ps format tests: PASS'
