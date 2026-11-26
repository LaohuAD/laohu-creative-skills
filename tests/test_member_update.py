import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.request import Request


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".agents/skills/laohu-update/scripts/member-update.py"
spec = importlib.util.spec_from_file_location("member_update", SCRIPT)
member = importlib.util.module_from_spec(spec)
spec.loader.exec_module(member)
COPY = json.loads(member.COPY_PATH.read_text())
TOKEN = "example_token_" + "a" * 30
DEVICE = "example_device_" + "b" * 30
ASSET = "https://release-assets.githubusercontent.com/example?temporary=1"


def git(root, *args):
    return subprocess.check_output(
        ["git", "-C", str(root), *args], text=True, stderr=subprocess.DEVNULL
    ).strip()


class MemberUpdateTests(unittest.TestCase):
    def setUp(self):
        temp_dir = ROOT / ".cache/tmp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        sandbox = tempfile.TemporaryDirectory(prefix="member-client-test-", dir=temp_dir)
        self.addCleanup(sandbox.cleanup)
        self.location = Path(sandbox.name)
        self.repo = self.location / "repo"
        self.repo.mkdir()
        self.db = self.location / "state/member-update.sqlite3"
        self.state = member.LocalState(self.db, self.repo)
        self.api_data = {"state": "unbound", "version": "2.1.0", "feature": "2.1",
                         "publicVersion": "2.0.2", "details": member.DETAILS_URL, "botUrl": member.BOT_URL}

    def test_public_path_and_remind_once_per_feature(self):
        with patch.object(member, "api", return_value=self.api_data):
            initial = member.status(self.state, "2.0.1", COPY)
            self.assertEqual(initial["target"], {"channel": "public", "version": "2.0.2"})
            self.assertEqual(initial["reminder"], COPY["unbound"])
            self.assertIsNone(member.status(self.state, "2.0.1", COPY)["reminder"])
            self.api_data["version"] = "2.1.1"
            self.assertIsNone(member.status(self.state, "2.0.1", COPY)["reminder"])
            self.api_data["publicVersion"] = "2.1.0"
            fresh = member.LocalState(self.location / "fresh/state.sqlite3", self.repo)
            self.assertIsNone(member.status(fresh, "2.1.0", COPY)["reminder"])
            self.api_data.update(version="2.2.0", feature="2.2")
            self.assertEqual(member.status(self.state, "2.0.2", COPY)["reminder"], COPY["unbound"])

    def test_muted_pref_and_no_downgrade_offline(self):
        self.state.change(("muted", True))
        with patch.object(member, "api", return_value=self.api_data):
            self.assertIsNone(member.status(self.state, "2.0.1", COPY)["reminder"])
        self.state.change(("muted", False))
        with patch.object(member, "api", return_value=self.api_data):
            self.assertEqual(member.status(self.state, "2.0.1", COPY)["reminder"], COPY["unbound"])
        self.api_data.update(state="expired")
        with patch.object(member, "api", return_value=self.api_data):
            self.assertIsNone(member.status(self.state, "2.1.0", COPY)["target"])
        with patch.object(member, "api", side_effect=member.MemberError("network")):
            unavailable = member.status(self.state, "2.1.0", COPY)
            self.assertEqual(unavailable["state"], "unavailable")
            self.assertNotIn("target", unavailable)

    def test_active_gets_member_without_reminder(self):
        self.api_data.update(state="active", details="https://untrusted.invalid/checkout")
        with patch.object(member, "api", return_value=self.api_data):
            result = member.status(self.state, "2.0.2", COPY)
            self.assertEqual(result["target"], {"channel": "member", "version": "2.1.0"})
            self.assertIsNone(result["reminder"])
            self.assertEqual(result["detailsUrl"], member.DETAILS_URL)
            self.assertIsNone(member.status(self.state, "2.1.1", COPY)["target"])
            self.api_data.update(version=None, feature=None)
            self.assertIsNone(member.status(self.state, "2.0.2", COPY)["target"])

    def test_pair_credentials_stay_local_and_pending_can_resume(self):
        response = {"code": "X2QK-J9", "deviceCode": DEVICE, "expiresAt": int(time.time()) + 120,
                    "botUrl": "https://untrusted.invalid/feishu"}
        with patch.object(member, "api", return_value=response) as api:
            public = member.pair(self.state, COPY)
            self.assertEqual(public["message"], COPY["pair"].format(code="X2QK-J9"))
            self.assertEqual(public["botUrl"], member.BOT_URL)
            self.assertNotIn(DEVICE, json.dumps(public))
            self.assertEqual(member.pair(self.state, COPY), public)
            api.assert_called_once_with("pair", {})
        with patch.object(member, "api", return_value={"state": "approved", "token": TOKEN}) as api:
            self.assertEqual(member.poll(self.state), {"state": "approved"})
            api.assert_called_once_with("poll", {"deviceCode": DEVICE})
        self.assertIsNone(self.state.get("pending"))
        self.assertEqual(self.state.get("token"), TOKEN)
        if os.name == "posix":
            self.assertEqual(self.db.stat().st_mode & 0o777, 0o600)
            self.assertEqual(self.db.parent.stat().st_mode & 0o777, 0o700)

    def test_membership_api_identifies_the_updater(self):
        with patch.object(member, "build_opener") as build:
            build.return_value.open.return_value = io.BytesIO(b'{"state":"active"}')
            self.assertEqual(member.api("status", {}, TOKEN), {"state": "active"})
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, member.API + "status")
            self.assertEqual(request.get_method(), "POST")
            self.assertEqual(request.get_header("User-agent"), member.USER_AGENT)
            self.assertEqual(request.get_header("Authorization"), "Bearer " + TOKEN)

    def test_asset_hook_checks_redirect_and_never_sends_bearer(self):
        for unsafe in ("http://objects.githubusercontent.com/x", "https://api.github.com/private",
                       "https://objects.githubusercontent.com.evil.invalid/x",
                       "https://me@objects.githubusercontent.com/x", ASSET + "\n"):
            with self.assertRaises(member.MemberError):
                member.asset_url(unsafe)
        opener = member.AssetsOnly()
        with self.assertRaises(member.MemberError):
            opener.redirect_request(Request(ASSET), None, 302, "", {}, "https://example.invalid/x")

        payload = b"mock bundle"
        with patch.object(member, "build_opener") as build:
            build.return_value.open.return_value = io.BytesIO(payload)
            member.fetch_asset(ASSET, self.location / "good", hashlib.sha256(payload).hexdigest(), len(payload))
            sent_request = build.return_value.open.call_args.args[0]
            self.assertNotIn("Authorization", sent_request.headers)
            self.assertEqual(sent_request.get_header("User-agent"), member.USER_AGENT)
            build.return_value.open.return_value = io.BytesIO(payload)
            with self.assertRaises(member.MemberError):
                member.fetch_asset(ASSET, self.location / "bad-hash", "0" * 64, len(payload))
            build.return_value.open.return_value = io.BytesIO(payload)
            with self.assertRaises(member.MemberError):
                member.fetch_asset(ASSET, self.location / "oversize", "0" * 64, len(payload) - 1)

    def test_real_git_bundle_uses_public_base_and_preserves_local_files(self):
        public = self.location / "public"
        public.mkdir()
        git(public, "init")
        git(public, "config", "user.name", "Test")
        git(public, "config", "user.email", "test@example.invalid")
        (public / "VERSION").write_text("2.0.2\n")
        (public / "note").write_text("initial\n")
        git(public, "add", "VERSION", "note")
        git(public, "commit", "-m", "public")
        base = git(public, "rev-parse", "HEAD")
        git(self.repo, "clone", "--no-hardlinks", str(public), ".")
        git(public, "switch", "-c", "member-release")
        (public / "VERSION").write_text("2.1.0\n")
        (public / "member-only").write_text("fixture\n")
        git(public, "add", "VERSION", "member-only")
        git(public, "commit", "-m", "member")
        commit = git(public, "rev-parse", "HEAD")
        built = self.location / "valid.bundle"
        git(public, "bundle", "create", str(built), base + "..refs/heads/member-release")
        payload = built.read_bytes()
        self.state.change(("token", TOKEN))
        (self.repo / "note").write_text("local edits\n")
        git(self.repo, "add", "note")
        (self.repo / "local-only").write_text("local files\n")

        before = git(self.repo, "status", "--porcelain")
        response = {"url": ASSET, "version": "2.1.0", "commit": commit, "base": base,
                    "sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload)}

        def save_asset(url, path, digest, size):
            self.assertEqual(url, ASSET)
            path.write_bytes(payload)

        with patch.object(member, "api", return_value=response) as api:
            with patch.object(member, "fetch_asset", side_effect=save_asset) as transfer:
                result = member.fetch_release(self.state, self.repo, "2.0.2", "2.1.0")
                self.assertEqual(result["commit"], commit)
                self.assertEqual(git(self.repo, "rev-parse", result["ref"]), commit)
                self.assertEqual(result["ref"], "refs/laohu/member/2.1.0")
                api.assert_called_once_with("download", {}, TOKEN)
                self.assertEqual(member.fetch_release(self.state, self.repo, "2.0.2", "2.1.0"), result)
                self.assertEqual(transfer.call_count, 1)
                response["commit"] = "0" * 40
                with self.assertRaisesRegex(member.MemberError, "同一会员发布版本"):
                    member.fetch_release(self.state, self.repo, "2.0.2", "2.1.0")
        self.assertEqual(git(self.repo, "status", "--porcelain"), before)
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), base)
        self.assertFalse((self.repo / "member-only").exists())
        self.assertEqual(git(self.repo, "show", commit + ":member-only"), "fixture")
        self.assertFalse((self.repo / ".git/FETCH_HEAD").exists())


if __name__ == "__main__":
    unittest.main()
