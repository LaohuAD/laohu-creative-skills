#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
script="$repo_root/.agents/skills/laohu-luna/scripts/laohu-luna.sh"
mkdir -p "$repo_root/.cache"
test_root="$(mktemp -d "$repo_root/.cache/laohu-luna-doctor-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

mkdir -p "$test_root/codex-home"
fake_cli="$test_root/codex"
doctor_out="$test_root/doctor.json"

cat > "$fake_cli" <<'SH'
#!/bin/sh
if [ "$1" = login ] && [ "$2" = status ]; then
    printf '%s\n' "$FAKE_LOGIN_STATUS"
    exit 0
fi
exit 90
SH
chmod +x "$fake_cli"

check_case() {
    local auth="$1" expected="$2"
    FAKE_LOGIN_STATUS="$auth" \
    ASTRA_LUNA_CODEX_BIN="$fake_cli" \
    CODEX_HOME="$test_root/codex-home" \
    LAOHU_LUNA_STATE_DIR="$test_root/state" \
        bash "$script" doctor > "$doctor_out"
    python3 - "$doctor_out" "$expected" "$repo_root/.agents/skills/laohu-luna/agents/luna-worker.toml" <<'PY'
import json, re, sys
with open(sys.argv[1], encoding="utf-8") as f:
    doctor = json.load(f)
expected = sys.argv[2]
with open(sys.argv[3], encoding="utf-8") as f:
    role = f.read()
model = re.search(r'(?m)^\s*model\s*=\s*"([^"]+)"', role).group(1)
effort = re.search(r'(?m)^\s*model_reasoning_effort\s*=\s*"([^"]+)"', role).group(1)
cli = doctor["local_worker_cli"]
assert doctor["worker_config_exists"] is True, doctor
assert doctor["worker_config_path"].endswith("/agents/luna-worker.toml"), doctor
assert doctor["worker_model"] == model, doctor
assert doctor["worker_effort"] == effort, doctor
assert "native_role_registered" not in doctor, doctor
assert cli["authentication_status"] == expected, cli
assert cli["config_loadable"] is True, cli
assert cli["model_execution_status"] == "unknown", cli
assert doctor["worker_model_execution_note"].find("does not test account model access") >= 0
if expected == "not_authenticated":
    assert cli["environment_ready_to_attempt"] is False, cli
else:
    assert cli["environment_ready_to_attempt"] is True, cli
PY
}

check_case 'Logged in using ChatGPT' authenticated
check_case 'Not logged in' not_authenticated
echo 'doctor CLI/auth/model-separation tests: PASS'
