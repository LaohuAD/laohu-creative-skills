#!/usr/bin/env python3
"""Inspect member releases and fetch a verified Git bundle without changing the checkout."""

import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


API = "https://members.lao-hu.com/api/membership/skills/"
USER_AGENT = "laohu-member-skills/1.0"
DETAILS_URL = "https://lao-hu.com/learn/laohu-creative-skills/"
BOT_URL = "https://applink.feishu.cn/client/bot/open?appId=cli_aa62b5288778dc04"
ASSET_HOSTS = {"release-assets.githubusercontent.com", "objects.githubusercontent.com"}
MEMBER_REF = "refs/heads/member-release"
ROOT = Path(__file__).resolve().parents[4]
COPY_PATH = Path(__file__).resolve().parents[1] / "references" / "member-update-copy.json"


class MemberError(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def require(condition, message):
    if not condition:
        raise MemberError(message)


def matching(value, pattern):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def version_parts(value):
    require(matching(value, r"(?:0|[1-9][0-9]{0,5})(?:\.(?:0|[1-9][0-9]{0,5})){2}"),
            "未能核实版本号。")
    return tuple(map(int, value.split(".")))


def secret(value):
    require(matching(value, r"[A-Za-z0-9_-]{24,256}"), "未能核实设备凭证。")
    return value


def public_link(value, approved):
    if value == approved:
        return value
    if approved == DETAILS_URL and isinstance(value, str):
        if value.startswith(approved + "#") and matching(value[len(approved) + 1:], r"[a-zA-Z0-9_-]{1,100}"):
            return value
    return approved


class LocalState:
    def __init__(self, path, root):
        require(not path.resolve().is_relative_to(root), "设备凭证目录必须放在技能仓库之外。")
        self.path = path

    def connect(self, create):
        if create:
            self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except FileExistsError:
                pass
            else:
                os.close(fd)
        try:
            info = self.path.lstat()
        except FileNotFoundError:
            return None
        require(stat.S_ISREG(info.st_mode), "设备凭证位置无法使用。")
        if os.name == "posix":
            require(info.st_uid == os.getuid() and info.st_mode & 0o077 == 0
                    and self.path.parent.lstat().st_mode & 0o077 == 0,
                    "设备凭证目录或文件权限需要收紧。")
        db = sqlite3.connect(self.path, timeout=5)
        db.execute("CREATE TABLE IF NOT EXISTS local (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        return db

    def get(self, key):
        db = self.connect(create=False)
        if db is None:
            return None
        with closing(db):
            row = db.execute("SELECT value FROM local WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def change(self, *pairs):
        with closing(self.connect(create=True)) as db, db:
            db.executemany("INSERT OR REPLACE INTO local(key, value) VALUES (?, ?)",
                           ((key, json.dumps(value)) for key, value in pairs))

    def claim_reminder(self, feature):
        # Claim one per feature version, even when two Agent windows check concurrently.
        if self.get("muted"):
            return False
        with closing(self.connect(create=True)) as db, db:
            changed = db.execute(
                """INSERT OR IGNORE INTO local(key, value)
                   SELECT ?, 'true' WHERE NOT EXISTS
                   (SELECT 1 FROM local WHERE key='muted' AND value='true')""", ("seen:" + feature,)
            )
            return changed.rowcount == 1


def api(action, body, token=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json",
               "User-Agent": USER_AGENT}
    if token:
        headers["Authorization"] = "Bearer " + secret(token)
    request = Request(API + action, json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with build_opener(NoRedirect()).open(request, timeout=12) as response:
            raw = response.read(16_385)
    except HTTPError as exc:
        exc.close()
        if exc.code in (401, 403):
            raise MemberError("会员授权暂不可用，请检查设备绑定或会员期限。") from None
        raise MemberError("暂时连不上更新服务，本机版本可以继续使用。") from None
    except (URLError, OSError):
        raise MemberError("暂时连不上更新服务，本机版本可以继续使用。") from None
    require(len(raw) <= 16_384, "更新服务返回的信息超出预期。")
    try:
        data = json.loads(raw)
    except ValueError:
        raise MemberError("未能读取更新服务的回复。") from None
    require(isinstance(data, dict), "未能读取更新服务的回复。")
    return data


def status(state, local_version, copy):
    try:
        data = api("status", {}, state.get("token"))
    except MemberError:
        return {"state": "unavailable", "localVersion": local_version, "message": copy["offline"]}
    account = data.get("state")
    require(account in ("unbound", "active", "expired"), "未能核实设备的会员授权。")
    public = data.get("publicVersion")
    member = data.get("version") or ""
    feature = data.get("feature") or ""
    public_parts, local_parts = version_parts(public), version_parts(local_version)
    member_parts = version_parts(member) if member else None
    require(not member or (matching(feature, r"[0-9]{1,6}\.[0-9]{1,6}")
                          and feature == ".".join(member.split(".")[:2])),
            "未能核实会员发布版本。")

    result = {"state": account, "localVersion": local_version, "publicVersion": public,
              "memberVersion": member or None, "feature": feature or None,
              "detailsUrl": public_link(data.get("details"), DETAILS_URL),
              "botUrl": public_link(data.get("botUrl"), BOT_URL), "reminder": None}
    if account == "active" and member_parts and member_parts > max(public_parts, local_parts):
        result["target"] = {"channel": "member", "version": member}
    elif public_parts > local_parts:
        result["target"] = {"channel": "public", "version": public}
    else:
        result["target"] = None
    if account == "expired":
        result["message"] = copy["expired"]
    if (account == "unbound" and member_parts
            and member_parts[:2] > max(public_parts[:2], local_parts[:2])
            and state.claim_reminder(feature)):
        result["reminder"] = copy["unbound"]
    return result


def pair(state, copy):
    existing = state.get("pending")
    if existing and existing["expiresAt"] > int(time.time()):
        data = existing
    else:
        data = api("pair", {})
        code, expires = data.get("code"), data.get("expiresAt")
        require(matching(code, r"[A-Z0-9]{3,10}(?:-[A-Z0-9]{2,10})?")
                and type(expires) is int and int(time.time()) < expires <= int(time.time()) + 3600,
                "未能核实本机的配对指令。")
        data = {"code": code, "expiresAt": expires,
                "botUrl": public_link(data.get("botUrl"), BOT_URL),
                "deviceCode": secret(data.get("deviceCode"))}
        state.change(("pending", data))
    return {"state": "pending", "message": copy["pair"].format(code=data["code"]),
            "expiresAt": data["expiresAt"], "botUrl": data["botUrl"]}


def poll(state):
    pending = state.get("pending")
    if not pending or pending["expiresAt"] <= int(time.time()):
        return {"state": "expired"}
    data = api("poll", {"deviceCode": secret(pending["deviceCode"])})
    authorization = data.get("state")
    require(authorization in ("pending", "approved", "expired"), "未能核实配对结果。")
    result = {"state": authorization}
    if authorization == "approved":
        state.change(("token", secret(data.get("token"))), ("pending", None))
    elif authorization == "expired":
        state.change(("pending", None))
    return result


def asset_url(value):
    require(isinstance(value, str) and 1 <= len(value) <= 8192
            and not any(ord(c) < 33 or ord(c) > 126 for c in value),
            "下载地址无法使用。")
    url = urlsplit(value)
    require(url.scheme == "https" and url.netloc in ASSET_HOSTS
            and url.path.startswith("/") and not url.fragment,
            "下载地址未指向获准的 GitHub 附件服务。")
    return value


class AssetsOnly(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, asset_url(newurl))


def fetch_asset(url, path, digest, size):
    opener = build_opener(AssetsOnly())
    actual = hashlib.sha256()
    remaining = size
    try:
        # Separate from the membership client. No bearer header is sent here.
        request = Request(asset_url(url), headers={"User-Agent": USER_AGENT})
        with opener.open(request, timeout=30) as response, path.open("xb") as file:
            while remaining:
                block = response.read(min(remaining, 1024 * 1024))
                require(block, "下载中断，请重新获取会员发布文件。")
                file.write(block)
                actual.update(block)
                remaining -= len(block)
            require(not response.read(1), "会员发布文件大小超出登记值。")
    except (URLError, HTTPError, OSError):
        raise MemberError("下载中断，请重新获取会员发布文件。") from None
    require(actual.hexdigest() == digest, "会员发布文件校验失败。")


def git(root, *args):
    check = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, timeout=180)
    if check.returncode:
        raise MemberError("Git 无法验证或导入会员发布文件，请检查项目及公开版基线。")
    return check.stdout.strip()


def pinned_commit(root, ref):
    rows = git(root, "for-each-ref", "--format=%(refname) %(objectname)", ref).splitlines()
    return next((row.split(" ", 1)[1] for row in rows if row.startswith(ref + " ")), "")


def fetch_release(state, root, local_version, version):
    require(version_parts(version) > version_parts(local_version), "本机版本无需降级或重复安装。")
    token = state.get("token")
    require(token, "请先在泠月 Luna 确认这台设备的会员授权。")
    data = api("download", {}, token)
    require(data.get("version") == version, "可用版本已变化，请重新检查更新。")
    commit, base, digest, size = (data.get(key) for key in ("commit", "base", "sha256", "bytes"))
    require(matching(commit, r"[0-9a-f]{40}") and matching(base, r"[0-9a-f]{40}")
            and matching(digest, r"[0-9a-f]{64}") and type(size) is int and 0 < size < 2 * 1024**3,
            "未能核实会员版的提交、基线或附件。")
    require(git(root, "rev-parse", "--show-toplevel") == str(root), "请在完整技能仓库中执行更新。")
    git(root, "cat-file", "-e", base + "^{commit}")
    ref = "refs/laohu/member/" + version
    pinned = pinned_commit(root, ref)
    require(not pinned or pinned == commit, "同一会员发布版本出现不同提交，请联系维护者。")
    if not pinned:
        temp_root = root / ".cache/tmp"
        require(temp_root.resolve().is_relative_to(root), "下载暂存路径必须位于技能仓库内。")
        temp_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="member-update-", dir=temp_root) as directory:
            bundle = Path(directory) / "release.bundle"
            fetch_asset(data.get("url"), bundle, digest, size)
            require(git(root, "bundle", "list-heads", str(bundle)) == f"{commit} {MEMBER_REF}",
                    "会员发布文件包含其他提交入口。")
            git(root, "bundle", "verify", str(bundle))
            git(root, "fetch", "--no-tags", "--no-write-fetch-head", str(bundle), MEMBER_REF)
    git(root, "merge-base", "--is-ancestor", base, commit)
    require(git(root, "show", commit + ":VERSION") == version, "会员发布文件内的版本不一致。")
    if not pinned:
        try:
            git(root, "update-ref", ref, commit, "0" * 40)
        except MemberError:
            require(pinned_commit(root, ref) == commit, "无法锁定会员发布提交。")
    return {"state": "verified", "channel": "member", "version": version, "commit": commit,
            "base": base, "ref": ref}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("status", "pair", "poll", "fetch", "skip", "mute", "unmute"))
    parser.add_argument("--version", help="Exact member version selected by status")
    parser.add_argument("--feature", help="Feature version to skip, such as 2.1")
    args = parser.parse_args()
    try:
        root = ROOT.resolve()
        copy = json.loads(COPY_PATH.read_text(encoding="utf-8"))
        local = (root / "VERSION").read_text(encoding="utf-8").strip()
        state = LocalState(Path.home() / ".laohu-creative-skills/member-update.sqlite3", root)
        if args.action == "status":
            result = status(state, local, copy)
        elif args.action == "pair":
            result = pair(state, copy)
        elif args.action == "poll":
            result = poll(state)
        elif args.action == "fetch":
            result = fetch_release(state, root, local, args.version)
        elif args.action == "skip":
            require(matching(args.feature, r"[0-9]{1,6}\.[0-9]{1,6}"), "请指定本次的功能版本。")
            state.change(("seen:" + args.feature, True))
            result = {"state": "skipped", "message": copy["skip"]}
        else:
            mute = args.action == "mute"
            state.change(("muted", mute))
            result = {"state": "muted" if mute else "unmuted"}
            if mute:
                result["message"] = copy["mute"]
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except MemberError as exc:
        print(json.dumps({"state": "error", "message": str(exc)}, ensure_ascii=False))
    except (OSError, ValueError, sqlite3.Error, subprocess.TimeoutExpired):
        print(json.dumps({"state": "error", "message": "更新暂未完成，本机现有版本可以继续使用。"},
                         ensure_ascii=False))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
