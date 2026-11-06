#!/usr/bin/env python3
"""Local, private-first source and method-atom library for laohu-benchmark.

Canonical records are JSON/JSONL files. SQLite is a disposable search cache and
is never created by read commands. No network or third-party package is used.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import signal
import sqlite3
import stat
import sys
import time
import unicodedata
import uuid
from pathlib import Path
from typing import Any, Iterable

FORMAT_VERSION = 1
SOURCE_ID = re.compile(r"^SRC-[A-F0-9]{16}$")
ATOM_ID = re.compile(r"^ATM-[A-F0-9]{16}$")
USAGE_ID = re.compile(r"^USG-[A-F0-9]{16}$")
CATEGORY = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
RESERVED_CATEGORY_NAMES = {"sources"}
CONSUMER = re.compile(r"^[a-z][a-z0-9-]*(?:/[a-z0-9][a-z0-9-]*)?$")
SOURCE_STATES = {"candidate", "identity-checked", "unit-located", "context-readable", "limited"}
ATOM_STATES = {"candidate", "observed", "method-candidate", "method-ready"}
USAGE_OUTCOMES = {"applied", "adapted", "rejected", "not-used", "pending"}
INDEX_NAME = "index.sqlite3"
CATALOG_NAME = "catalog.sqlite3"
CATALOG_FORMAT_VERSION = 1
MAX_QUERY_CARD_BYTES = 16 * 1024
LOCK_NAME = ".library.lock"
TRANSACTIONS_DIR = ".transactions"
TRANSACTION_ID = re.compile(r"^TXN-[a-f0-9]{32}$")
SHA256_HEX = re.compile(r"^[a-f0-9]{64}$")


class LibraryError(ValueError):
    pass


def _valid_category(value: Any) -> bool:
    return isinstance(value, str) and CATEGORY.fullmatch(value) is not None \
        and value not in RESERVED_CATEGORY_NAMES


def _canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest().upper()[:16]


def _utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _absolute_root(root: str | os.PathLike[str]) -> Path:
    path = Path(root).expanduser()
    if not path.is_absolute() or ".." in path.parts:
        raise LibraryError("library root must be an absolute path without parent traversal")
    _reject_symlink_components(path, allow_missing=True)
    return path


def _reject_symlink_components(path: Path, *, allow_missing: bool) -> None:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current = current / part
        if current.is_symlink():
            raise LibraryError(f"refusing symbolic link in library path: {current}")
        if current.exists() and not current.is_dir() and current != path:
            raise LibraryError(f"library path component is not a directory: {current}")
        if not current.exists() and not allow_missing:
            raise LibraryError(f"library path does not exist: {current}")


def _contained(root: Path, relative: str) -> Path:
    rel = Path(relative)
    if rel.is_absolute() or ".." in rel.parts or "\\" in relative:
        raise LibraryError(f"unsafe library-relative path: {relative}")
    target = root / rel
    if root not in target.parents:
        raise LibraryError(f"path leaves library root: {relative}")
    current = root
    for part in rel.parts:
        current = current / part
        if current.is_symlink():
            raise LibraryError(f"refusing symbolic link: {current}")
    return target


def _safe_mkdir(path: Path, root: Path) -> list[Path]:
    """Create missing directories without following links; return those created."""
    if root not in path.parents and path != root:
        raise LibraryError("directory leaves library root")
    missing: list[Path] = []
    current = path
    while current != root and not current.exists():
        if current.is_symlink():
            raise LibraryError(f"refusing symbolic link: {current}")
        missing.append(current)
        current = current.parent
    if current.is_symlink() or (current.exists() and not current.is_dir()):
        raise LibraryError(f"directory path is occupied or linked: {current}")
    for directory in reversed(missing):
        directory.mkdir()
    return missing


def _load_json(path: Path) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise LibraryError(f"record is missing or not a regular file: {path}")
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise LibraryError(f"cannot read JSON record {path}: {error}") from error
    if not isinstance(result, dict):
        raise LibraryError(f"record must be a JSON object: {path}")
    return result


def _write_json_file(path: Path, data: dict[str, Any]) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())


def _semantic_record(data: dict[str, Any]) -> dict[str, Any]:
    """Ignore tool-added timestamps when checking an idempotent retry."""
    return {key: value for key, value in data.items() if key not in {"created_at", "added_at"}}


def _validate_source(record: dict[str, Any], *, add_id: bool = False) -> dict[str, Any]:
    result = dict(record)
    if set(result) - {"schema_version", "source_id", "identity", "provenance", "source_material", "evidence_status",
                      "work_family_id", "notes", "added_at"}:
        raise LibraryError("source has fields not allowed by source.schema.json")
    if result.get("schema_version", FORMAT_VERSION) != FORMAT_VERSION:
        raise LibraryError("source schema_version must be 1")
    identity = result.get("identity")
    provenance = result.get("provenance")
    if not isinstance(identity, dict) or not all(isinstance(identity.get(key), str) and identity[key].strip()
                                                  for key in ("title", "creator", "medium", "version")):
        raise LibraryError("source.identity needs nonempty title, creator, medium and version")
    if not isinstance(provenance, dict) or not all(isinstance(provenance.get(key), str) and provenance[key].strip()
                                                    for key in ("identity_basis", "locator", "access_scope")):
        raise LibraryError("source.provenance needs identity_basis, locator and access_scope")
    material = result.get("source_material")
    if not isinstance(material, dict) or set(material) - {
            "reference_kind", "reference", "version", "read_scope", "captured_excerpt", "content_sha256"}:
        raise LibraryError("source.source_material must provide an explicit material reference")
    if any(not isinstance(material.get(key), str) or not material[key].strip()
           for key in ("reference_kind", "reference", "version", "read_scope")):
        raise LibraryError("source.source_material needs reference_kind, reference, version and read_scope")
    if material["reference_kind"] not in {"user-provided-text", "user-file", "public-source", "licensed-copy", "media-source", "other"}:
        raise LibraryError("source.source_material.reference_kind is not supported")
    if material["reference_kind"] == "user-provided-text" and (
            not isinstance(material.get("captured_excerpt"), str) or not material["captured_excerpt"].strip()):
        raise LibraryError("user-provided text must retain its authorized source material in captured_excerpt")
    if "captured_excerpt" in material and (not isinstance(material["captured_excerpt"], str)
                                             or not material["captured_excerpt"].strip()):
        raise LibraryError("source.source_material.captured_excerpt must be a nonempty string")
    if "content_sha256" in material and (not isinstance(material["content_sha256"], str)
                                          or not re.fullmatch(r"[A-Fa-f0-9]{64}", material["content_sha256"])):
        raise LibraryError("source.source_material.content_sha256 must be a 64-character SHA-256 hex digest")
    state = result.get("evidence_status", "candidate")
    if not isinstance(state, str) or state not in SOURCE_STATES:
        raise LibraryError(f"invalid source evidence_status: {state}")
    result["schema_version"] = FORMAT_VERSION
    result["evidence_status"] = state
    if not result.get("source_id") and add_id:
        result["source_id"] = "SRC-" + _sha({"identity": identity, "locator": provenance["locator"]})
    if not isinstance(result.get("source_id"), str) or not SOURCE_ID.fullmatch(result["source_id"]):
        raise LibraryError("source_id must use SRC- plus 16 uppercase hexadecimal digits")
    for key in ("work_family_id", "notes"):
        if key in result and not isinstance(result[key], str):
            raise LibraryError(f"source.{key} must be a string")
    return result


def _validate_material_index_card(card: Any) -> dict[str, Any]:
    if (not isinstance(card, dict) or set(card) - {"title", "summary", "terms"}
            or any(not isinstance(card.get(key), str) or not card[key].strip() for key in ("title", "summary"))
            or len(card.get("summary", "")) > 200 or "\n" in card.get("summary", "")
            or "\r" in card.get("summary", "")):
        raise LibraryError("material index_card needs a one-line title and summary (summary max 200 characters)")
    terms = card.get("terms", [])
    if not isinstance(terms, list) or any(not isinstance(term, str) or not term.strip() for term in terms):
        raise LibraryError("material index_card.terms must be a list of nonempty strings")
    return card


def _validate_new_unit_extensions(source: dict[str, Any]) -> None:
    """Validate progressive fields on writes without narrowing legacy reads."""
    units = source.get("provenance", {}).get("independent_units")
    if not isinstance(units, list):
        return
    for unit in units:
        if not isinstance(unit, dict):
            continue
        if "index_card" in unit:
            _validate_material_index_card(unit["index_card"])
        if "verified_span" in unit:
            span = unit["verified_span"]
            if (not isinstance(span, dict) or set(span) != {"source_version", "start", "end", "sha256"}
                    or not isinstance(span.get("source_version"), str) or not span["source_version"].strip()
                    or type(span.get("start")) is not int or type(span.get("end")) is not int
                    or span["start"] < 0 or span["end"] <= span["start"]
                    or not isinstance(span.get("sha256"), str)
                    or not re.fullmatch(r"[A-Fa-f0-9]{64}", span["sha256"])):
                raise LibraryError("independent unit verified_span needs source_version, start, end and SHA-256")
            excerpt = source.get("source_material", {}).get("captured_excerpt")
            if (not isinstance(excerpt, str) or span["source_version"] != source["source_material"].get("version")
                    or span["end"] > len(excerpt)):
                raise LibraryError("verified_span does not match the captured excerpt and source version")
            excerpt_hash = hashlib.sha256(excerpt[span["start"]:span["end"]].encode("utf-8")).hexdigest()
            if excerpt_hash.casefold() != span["sha256"].casefold():
                raise LibraryError("verified_span SHA-256 does not match the selected source text")


def _stable_source_units(source: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """Return stable unit-key mode or a whole-source fallback for legacy data."""
    units = source.get("provenance", {}).get("independent_units")
    if not isinstance(units, list) or not units or any(not isinstance(unit, dict) for unit in units):
        return "whole-source", []
    keys = [unit.get("unit") for unit in units]
    if any(not isinstance(key, str) or not key.strip() for key in keys):
        return "whole-source", []
    if len(set(keys)) != len(keys):
        return "ambiguous", units
    return "units", units


def _validate_atom_source_link(atom: dict[str, Any], source: dict[str, Any]) -> None:
    reference = atom["analysis"]["observed_unit"].get("source_unit_ref")
    if reference is None:
        return
    mode, units = _stable_source_units(source)
    key = reference["unit_key"]
    if mode != "units" or not any(unit.get("unit") == key for unit in units):
        raise LibraryError(f"atom {atom['atom_id']} source_unit_ref does not resolve to one stable source unit")


def _validate_binding(binding: dict[str, Any]) -> None:
    required = ("consumer", "decision", "stage", "required_context", "adaptation", "return", "check")
    if set(binding) - set(required):
        raise LibraryError("consumer_binding has fields not allowed by atom.schema.json")
    if any(not isinstance(binding.get(key), str) or not binding[key].strip() for key in required):
        raise LibraryError("each consumer_binding needs consumer, decision, stage, required_context, adaptation, return and check")
    if not CONSUMER.fullmatch(binding["consumer"]):
        raise LibraryError(f"invalid consumer name in binding: {binding['consumer']}")


def _validate_atom(record: dict[str, Any], *, add_id: bool = False, default_source: str | None = None) -> dict[str, Any]:
    result = dict(record)
    if set(result) - {"schema_version", "atom_id", "source_id", "category", "index_card", "analysis",
                      "consumer_bindings", "evidence_status", "created_at"}:
        raise LibraryError("atom has fields not allowed by atom.schema.json")
    if result.get("schema_version", FORMAT_VERSION) != FORMAT_VERSION:
        raise LibraryError("atom schema_version must be 1")
    if not result.get("source_id") and default_source:
        result["source_id"] = default_source
    if not isinstance(result.get("source_id"), str) or not SOURCE_ID.fullmatch(result["source_id"]):
        raise LibraryError("atom needs a valid source_id")
    category = result.get("category")
    if isinstance(category, str) and category in RESERVED_CATEGORY_NAMES:
        raise LibraryError(f"category name is reserved for library data: {category}")
    if not _valid_category(category):
        raise LibraryError("category must be a lowercase slug; ambiguous categories must be resolved before saving")
    card = result.get("index_card")
    if not isinstance(card, dict) or any(not isinstance(card.get(key), str) or not card[key].strip()
                                         for key in ("title", "summary")):
        raise LibraryError("index_card needs a concise title and summary")
    if set(card) - {"title", "summary", "terms"}:
        raise LibraryError("index_card has fields not allowed by atom.schema.json")
    if len(card["summary"]) > 200 or "\n" in card["summary"]:
        raise LibraryError("index_card.summary must be one line and no longer than 200 characters")
    terms = card.get("terms", [])
    if not isinstance(terms, list) or any(not isinstance(term, str) or not term.strip() for term in terms):
        raise LibraryError("index_card.terms must be a list of nonempty strings")
    analysis = result.get("analysis")
    if not isinstance(analysis, dict):
        raise LibraryError("atom.analysis must be an object")
    unit = analysis.get("observed_unit")
    if not isinstance(unit, dict) or any(not isinstance(unit.get(key), str) or not unit[key].strip()
                                         for key in ("location", "context_summary")):
        raise LibraryError("analysis.observed_unit needs a concrete location and sufficient context summary")
    source_unit_ref = unit.get("source_unit_ref")
    if source_unit_ref is not None and (
            not isinstance(source_unit_ref, dict) or set(source_unit_ref) != {"unit_key"}
            or not isinstance(source_unit_ref.get("unit_key"), str) or not source_unit_ref["unit_key"].strip()):
        raise LibraryError("analysis.observed_unit.source_unit_ref must contain one stable unit_key")
    observations = analysis.get("visible_observations")
    if not isinstance(observations, list) or not observations or any(not isinstance(item, str) or not item.strip()
                                                                     for item in observations):
        raise LibraryError("analysis.visible_observations must contain concrete, nonempty observations")
    inference = analysis.get("mechanism_inference")
    if not isinstance(inference, dict) or not isinstance(inference.get("claim"), str) or not inference["claim"].strip():
        raise LibraryError("analysis.mechanism_inference.claim must be explicitly stated")
    conditions = analysis.get("conditions")
    if not isinstance(conditions, dict):
        raise LibraryError("analysis.conditions must state application conditions and limits")
    if set(conditions) - {"applies_when", "fixed_relations", "open_variables", "limits"}:
        raise LibraryError("analysis.conditions has fields not allowed by atom.schema.json")
    for key in ("applies_when", "fixed_relations", "open_variables", "limits"):
        if not isinstance(conditions.get(key), list) or any(not isinstance(item, str) or not item.strip()
                                                            for item in conditions[key]):
            raise LibraryError(f"analysis.conditions.{key} must be a list (empty is allowed when justified)")
    effect = analysis.get("effect_evidence")
    if (not isinstance(effect, dict) or not isinstance(effect.get("status"), str)
            or effect["status"] not in {"unknown", "not-assessed", "observed"}):
        raise LibraryError("analysis.effect_evidence.status is required and must be unknown, not-assessed or observed")
    bindings = result.get("consumer_bindings")
    if not isinstance(bindings, list) or not bindings:
        raise LibraryError("atom needs at least one task-specific consumer_binding")
    for binding in bindings:
        if not isinstance(binding, dict):
            raise LibraryError("consumer_binding items must be objects")
        _validate_binding(binding)
    state = result.get("evidence_status", "candidate")
    if not isinstance(state, str) or state not in ATOM_STATES:
        raise LibraryError(f"invalid atom evidence_status: {state}")
    result["schema_version"] = FORMAT_VERSION
    result["evidence_status"] = state
    if not result.get("atom_id") and add_id:
        result["atom_id"] = "ATM-" + _sha({
            "source_id": result["source_id"], "category": category,
            "location": unit["location"], "title": card["title"],
            "mechanism": inference["claim"],
        })
    if not isinstance(result.get("atom_id"), str) or not ATOM_ID.fullmatch(result["atom_id"]):
        raise LibraryError("atom_id must use ATM- plus 16 uppercase hexadecimal digits")
    return result


def source_path(root: Path, source_id: str) -> Path:
    if not isinstance(source_id, str) or not SOURCE_ID.fullmatch(source_id):
        raise LibraryError("invalid source ID")
    return _contained(root, f"sources/{source_id}.json")


def atom_path(root: Path, category: str, atom_id: str) -> Path:
    if not _valid_category(category) \
            or not isinstance(atom_id, str) or not ATOM_ID.fullmatch(atom_id):
        raise LibraryError("invalid atom category or ID")
    return _contained(root, f"{category}/atoms/{atom_id}.json")


def _record_files(root: Path, folder: str, pattern: str) -> list[Path]:
    directory = root / folder
    if not directory.exists():
        return []
    if directory.is_symlink() or not directory.is_dir():
        raise LibraryError(f"record directory is linked or not a directory: {directory}")
    result = []
    for path in sorted(directory.glob(pattern)):
        if path.is_symlink() or not path.is_file():
            raise LibraryError(f"refusing non-file or symbolic link: {path}")
        result.append(path)
    return result


def _all_sources(root: Path) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for path in _record_files(root, "sources", "SRC-*.json"):
        record = _validate_source(_load_json(path))
        if path.name != record["source_id"] + ".json":
            raise LibraryError(f"source filename does not match ID: {path}")
        if record["source_id"] in records:
            raise LibraryError(f"duplicate source ID: {record['source_id']}")
        records[record["source_id"]] = record
    return records


def _all_atoms(root: Path) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    if not root.exists():
        return records
    for category_dir in sorted(root.iterdir()):
        if category_dir.name in {"sources", TRANSACTIONS_DIR, "__pycache__"} or category_dir.name.startswith("."):
            continue
        if category_dir.is_symlink():
            raise LibraryError(f"refusing symbolic category path: {category_dir}")
        if not category_dir.is_dir():
            continue
        atom_dir = category_dir / "atoms"
        if not atom_dir.exists():
            continue
        if atom_dir.is_symlink() or not atom_dir.is_dir():
            raise LibraryError(f"atom directory is linked or not a directory: {atom_dir}")
        for path in sorted(atom_dir.glob("ATM-*.json")):
            if path.is_symlink() or not path.is_file():
                raise LibraryError(f"refusing non-file or symbolic link: {path}")
            record = _validate_atom(_load_json(path))
            if path.name != record["atom_id"] + ".json" or category_dir.name != record["category"]:
                raise LibraryError(f"atom filename/category does not match record: {path}")
            if record["atom_id"] in records:
                raise LibraryError(f"duplicate atom ID: {record['atom_id']}")
            records[record["atom_id"]] = record
    return records


def _atom_fingerprint(atom: dict[str, Any]) -> str:
    unit = atom["analysis"]["observed_unit"]
    claim = atom["analysis"]["mechanism_inference"]["claim"]
    return _sha({"source_id": atom["source_id"], "category": atom["category"],
                 "location": unit["location"], "title": atom["index_card"]["title"], "claim": claim})


def _read_journal(path: Path, root: Path) -> dict[str, Any]:
    journal = _load_json(path)
    required = {"format_version", "transaction_id", "state", "items"}
    if set(journal) != required:
        raise LibraryError(f"invalid transaction journal: {path}")
    transaction_id = path.parent.name
    if (type(journal.get("format_version")) is not int
            or journal["format_version"] != FORMAT_VERSION
            or not isinstance(journal.get("transaction_id"), str)
            or not TRANSACTION_ID.fullmatch(journal["transaction_id"])
            or journal["transaction_id"] != transaction_id
            or journal.get("state") != "prepared"
            or not isinstance(journal.get("items"), list)
            or not journal["items"]):
        raise LibraryError(f"invalid transaction journal header: {path}")
    targets: set[Path] = set()
    staged_paths: set[str] = set()
    for index, item in enumerate(journal["items"]):
        if not isinstance(item, dict) or set(item) != {"target", "staged", "sha256"}:
            raise LibraryError(f"invalid transaction journal item fields: {path} item {index}")
        target, staged, digest = item["target"], item["staged"], item["sha256"]
        if any(not isinstance(value, str) or not value.strip() or "\x00" in value
               for value in (target, staged, digest)):
            raise LibraryError(f"invalid transaction journal item types: {path} item {index}")
        if not SHA256_HEX.fullmatch(digest):
            raise LibraryError(f"invalid transaction journal SHA-256: {path} item {index}")
        try:
            target_path = _contained(root, target)
            _contained(root, staged)
        except (LibraryError, ValueError, OSError) as error:
            raise LibraryError(f"unsafe transaction journal path: {path} item {index}: {error}") from error
        normalized_target = Path(target).as_posix()
        target_parts = Path(target).parts
        source_target = (len(target_parts) == 2 and target_parts[0] == "sources"
                         and target_parts[1].endswith(".json")
                         and SOURCE_ID.fullmatch(target_parts[1][:-5]) is not None)
        atom_target = (len(target_parts) == 3 and _valid_category(target_parts[0])
                       and target_parts[1] == "atoms" and target_parts[2].endswith(".json")
                       and ATOM_ID.fullmatch(target_parts[2][:-5]) is not None)
        expected_staged = f"{TRANSACTIONS_DIR}/{transaction_id}/staged/{index:05d}.json"
        if (target != normalized_target or not (source_target or atom_target)
                or staged != expected_staged):
            raise LibraryError(f"transaction journal contains a non-record or noncanonical path: {path} item {index}")
        if target_path in targets or staged in staged_paths:
            raise LibraryError(f"transaction journal repeats a path: {path} item {index}")
        targets.add(target_path)
        staged_paths.add(staged)
    return journal


def _recover_unlocked(root: Path) -> list[str]:
    tx_dir = root / TRANSACTIONS_DIR
    if not tx_dir.exists():
        return []
    if tx_dir.is_symlink() or not tx_dir.is_dir():
        raise LibraryError(f"transaction directory is linked or not a directory: {tx_dir}")
    plans: list[tuple[Path, list[Path], str]] = []
    transactions = sorted(tx_dir.iterdir())
    for transaction in transactions:
        if transaction.is_symlink() or not transaction.is_dir():
            raise LibraryError(f"refusing malformed transaction path: {transaction}")
        if not TRANSACTION_ID.fullmatch(transaction.name):
            raise LibraryError(f"refusing malformed transaction ID: {transaction}")
        journal_path = transaction / "journal.json"
        if journal_path.is_symlink():
            raise LibraryError(f"refusing symbolic transaction journal: {journal_path}")
        if not journal_path.exists():
            plans.append((transaction, [], transaction.name + ":discarded-uncommitted-staging"))
            continue
        journal = _read_journal(journal_path, root)
        deletions = []
        for item in journal["items"]:
            target = _contained(root, item["target"])
            if target.is_symlink():
                raise LibraryError(f"cannot recover transaction over unexpected target: {target}")
            if target.exists():
                if not target.is_file():
                    raise LibraryError(f"cannot recover transaction over unexpected target: {target}")
                if hashlib.sha256(target.read_bytes()).hexdigest() != item["sha256"]:
                    raise LibraryError(f"transaction target changed; preserved for manual review: {target}")
                deletions.append(target)
        plans.append((transaction, deletions, transaction.name + ":rolled-back"))

    # Inspect and validate every transaction and all of its targets before the
    # first deletion, so one malformed later journal cannot partially roll
    # back an earlier valid transaction.
    recovered = []
    for transaction, deletions, outcome in plans:
        for target in deletions:
            target.unlink()
        shutil.rmtree(transaction)
        recovered.append(outcome)
    with contextlib.suppress(OSError):
        tx_dir.rmdir()
    return recovered


class LibraryLock:
    """Cross-platform lock via exclusive mkdir; no system temp files or fcntl."""
    def __init__(self, root: Path, wait_seconds: float = 10.0):
        self.root = root
        self.path = root / LOCK_NAME
        self.token = uuid.uuid4().hex
        self.wait_seconds = wait_seconds

    def __enter__(self):
        deadline = time.monotonic() + self.wait_seconds
        while True:
            try:
                self.path.mkdir()
                owner = {"pid": os.getpid(), "created_at": _utc_now(), "token": self.token}
                _write_json_file(self.path / "owner.json", owner)
                return self
            except FileExistsError:
                if self.path.is_symlink() or not self.path.is_dir():
                    raise LibraryError("library lock path is not a regular directory")
                owner_path = self.path / "owner.json"
                stale = False
                try:
                    owner = _load_json(owner_path)
                    pid = int(owner.get("pid", -1))
                    try:
                        os.kill(pid, 0)
                    except OSError:
                        stale = True
                except (LibraryError, TypeError, ValueError):
                    # A fresh owner file may not yet have been written.
                    try:
                        stale = time.time() - self.path.stat().st_mtime > 30
                    except OSError:
                        pass
                if stale:
                    quarantine = self.root / (LOCK_NAME + ".stale-" + uuid.uuid4().hex)
                    try:
                        self.path.rename(quarantine)
                        shutil.rmtree(quarantine)
                        continue
                    except (FileNotFoundError, OSError):
                        continue
                if time.monotonic() >= deadline:
                    raise LibraryError("library is busy; lock was preserved")
                time.sleep(0.05)

    def __exit__(self, exc_type, exc, tb):
        try:
            owner = _load_json(self.path / "owner.json")
            if owner.get("token") != self.token:
                raise LibraryError("library lock ownership changed; preserving lock")
            shutil.rmtree(self.path)
        except FileNotFoundError:
            pass


def _make_staged(root: Path, records: list[tuple[str, dict[str, Any]]]) -> str:
    txid = "TXN-" + uuid.uuid4().hex
    tx_dir = _contained(root, f"{TRANSACTIONS_DIR}/{txid}")
    _safe_mkdir(tx_dir, root)
    staged_dir = tx_dir / "staged"
    staged_dir.mkdir()
    items = []
    for index, (relative, record) in enumerate(records):
        target = _contained(root, relative)
        if target.exists():
            raise LibraryError(f"record already exists; refusing overwrite: {target}")
        staged = staged_dir / f"{index:05d}.json"
        _write_json_file(staged, record)
        digest = hashlib.sha256(staged.read_bytes()).hexdigest()
        items.append({"target": relative, "staged": staged.relative_to(root).as_posix(), "sha256": digest})
    journal = {"format_version": FORMAT_VERSION, "transaction_id": txid, "state": "prepared", "items": items}
    journal_tmp = tx_dir / "journal.tmp"
    _write_json_file(journal_tmp, journal)
    os.replace(journal_tmp, tx_dir / "journal.json")
    return txid


def _commit_staged(root: Path, txid: str) -> list[Path]:
    tx_dir = _contained(root, f"{TRANSACTIONS_DIR}/{txid}")
    journal = _read_journal(tx_dir / "journal.json", root)
    created_parents: list[Path] = []
    written: list[Path] = []
    try:
        for item in journal["items"]:
            target = _contained(root, item["target"])
            if target.exists():
                raise LibraryError(f"record appeared during commit; refusing overwrite: {target}")
            created_parents.extend(_safe_mkdir(target.parent, root))
            staged = _contained(root, item["staged"])
            os.replace(staged, target)
            written.append(target)
        shutil.rmtree(tx_dir)
        with contextlib.suppress(OSError):
            (root / TRANSACTIONS_DIR).rmdir()
        return written
    except Exception:
        # Roll back only files this transaction wrote, and only while their
        # bytes still match the staged journal. Never remove user content.
        for target, item in zip(written, journal["items"]):
            if target.is_file() and not target.is_symlink() \
                    and hashlib.sha256(target.read_bytes()).hexdigest() == item["sha256"]:
                target.unlink()
        for parent in created_parents:
            with contextlib.suppress(OSError):
                parent.rmdir()
        raise


def _index_digest(sources: dict[str, dict[str, Any]], atoms: dict[str, dict[str, Any]]) -> str:
    return hashlib.sha256(_canonical({"sources": sources, "atoms": atoms})).hexdigest()


def _read_all_valid(root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    sources = _all_sources(root)
    atoms = _all_atoms(root)
    for atom in atoms.values():
        if atom["source_id"] not in sources:
            raise LibraryError(f"atom {atom['atom_id']} references missing source {atom['source_id']}")
        _validate_atom_source_link(atom, sources[atom["source_id"]])
    return sources, atoms


def _write_category_index(root: Path, category: str,
                          sources: dict[str, dict[str, Any]],
                          atoms: dict[str, dict[str, Any]]) -> dict[str, Any]:
    category_atoms = {atom_id: atom for atom_id, atom in atoms.items() if atom["category"] == category}
    source_ids = {atom["source_id"] for atom in category_atoms.values()}
    category_sources = {source_id: sources[source_id] for source_id in source_ids}
    data_digest = _index_digest(category_sources, category_atoms)
    category_dir = _contained(root, category)
    if category_dir.is_symlink() or not category_dir.is_dir():
        raise LibraryError(f"category path is linked or not a directory: {category_dir}")
    temp = _contained(root, f"{category}/.{INDEX_NAME}.{uuid.uuid4().hex}.tmp")
    target = _contained(root, f"{category}/{INDEX_NAME}")
    if target.exists() and (target.is_symlink() or not target.is_file()):
        raise LibraryError(f"index path is linked or not a regular file: {target}")
    try:
        connection = sqlite3.connect(temp)
        try:
            connection.execute("PRAGMA journal_mode=DELETE")
            connection.execute("PRAGMA synchronous=FULL")
            connection.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("CREATE TABLE atoms (atom_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, category TEXT NOT NULL, source_title TEXT NOT NULL, creator TEXT NOT NULL, card_title TEXT NOT NULL, summary TEXT NOT NULL, terms TEXT NOT NULL, bindings TEXT NOT NULL, evidence_status TEXT NOT NULL)")
            connection.execute("CREATE INDEX atoms_source ON atoms(source_id)")
            connection.execute("INSERT INTO metadata(key,value) VALUES('format_version',?)", (str(FORMAT_VERSION),))
            connection.execute("INSERT INTO metadata(key,value) VALUES('category',?)", (category,))
            connection.execute("INSERT INTO metadata(key,value) VALUES('data_digest',?)", (data_digest,))
            connection.execute("INSERT INTO metadata(key,value) VALUES('built_at',?)", (_utc_now(),))
            for atom in category_atoms.values():
                source = sources[atom["source_id"]]
                identity = source["identity"]
                card = atom["index_card"]
                connection.execute("INSERT INTO atoms VALUES(?,?,?,?,?,?,?,?,?,?)", (
                    atom["atom_id"], atom["source_id"], category, identity["title"], identity["creator"],
                    card["title"], card["summary"], json.dumps(card.get("terms", []), ensure_ascii=False),
                    json.dumps(atom["consumer_bindings"], ensure_ascii=False), atom["evidence_status"],
                ))
            connection.commit()
        finally:
            connection.close()
        with temp.open("rb") as stream:
            os.fsync(stream.fileno())
        os.replace(temp, target)
    except Exception:
        with contextlib.suppress(OSError):
            temp.unlink()
        raise
    return {"category": category, "path": f"{category}/{INDEX_NAME}",
            "sources": len(category_sources), "atoms": len(category_atoms), "data_digest": data_digest}


def _short_line(value: Any, maximum: int = 200) -> str:
    if not isinstance(value, str):
        return ""
    normalized = " ".join(value.split())
    return normalized if len(normalized) <= maximum else normalized[:maximum - 1] + "…"


def _record_revision(record: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical(record)).hexdigest()


def _normalized_search_text(values: Iterable[Any]) -> str:
    pieces = [value for value in values if isinstance(value, str) and value.strip()]
    return unicodedata.normalize("NFKC", " ".join(pieces)).casefold()


def _material_cards_for_source(source: dict[str, Any]) -> list[dict[str, Any]]:
    source_id = source["source_id"]
    identity = source["identity"]
    provenance = source["provenance"]
    material = source["source_material"]
    source_revision = _record_revision(source)
    scope = json.dumps({
        "access_scope": _short_line(provenance["access_scope"], 240),
        "read_scope": _short_line(material["read_scope"], 240),
    }, ensure_ascii=False, sort_keys=True)
    mode, units = _stable_source_units(source)
    cards: list[dict[str, Any]] = []
    if mode == "units":
        for unit in units:
            authored = unit.get("index_card")
            try:
                authored = _validate_material_index_card(authored) if authored is not None else None
            except LibraryError:
                authored = None  # malformed legacy extension does not block legacy reads
            unit_key = unit["unit"]
            unit_title = unit.get("title") if isinstance(unit.get("title"), str) else ""
            title = _short_line((authored or {}).get("title") or unit_title or identity["title"], 240)
            disposition = unit.get("disposition") if isinstance(unit.get("disposition"), str) else ""
            locator = unit.get("locator") if isinstance(unit.get("locator"), str) else ""
            summary = _short_line((authored or {}).get("summary") or disposition or locator, 200)
            if not summary:
                summary = "Located source unit; open its material view to inspect the recorded scope."
            terms = list((authored or {}).get("terms", []))[:32]
            search_values = [title, unit_title, disposition, locator, (authored or {}).get("summary", ""), *terms]
            cards.append({
                "card_id": "material:" + source_id + ":" + hashlib.sha256(unit_key.encode("utf-8")).hexdigest(),
                "kind": "material",
                "ref": {"type": "material_unit", "source_id": source_id, "unit_key": unit_key},
                "record_revision": _record_revision(unit),
                "source_revision": source_revision,
                "source_id": source_id,
                "category": None,
                "source_title": _short_line(identity["title"], 200),
                "creator": _short_line(identity["creator"], 160),
                "title": title,
                "summary": summary,
                "source_scope": scope,
                "evidence_status": source["evidence_status"],
                "terms": json.dumps(terms, ensure_ascii=False),
                # Unit cards intentionally exclude the aggregate source title,
                # source notes and full source text from their search corpus.
                "search_text": _normalized_search_text(search_values),
                "declared_consumers": "[]",
                "detail_views": json.dumps(["identity", "material", "analysis"]),
                "source_ref": None,
            })
        return cards

    # Legacy sources with no complete set of stable keys remain discoverable as
    # one whole-source candidate. Their notes are only used at this level.
    authored = provenance.get("index_card") if isinstance(provenance, dict) else None
    try:
        authored = _validate_material_index_card(authored) if authored is not None else None
    except LibraryError:
        authored = None
    notes = source.get("notes", "")
    title = _short_line((authored or {}).get("title") or identity["title"], 240)
    summary = _short_line((authored or {}).get("summary") or notes or title, 200) or title
    terms = list((authored or {}).get("terms", []))[:32]
    notes_for_search = _short_line(notes, 500)
    cards.append({
        "card_id": "source:" + source_id,
        "kind": "material",
        "ref": {"type": "source", "source_id": source_id},
        "record_revision": source_revision,
        "source_revision": source_revision,
        "source_id": source_id,
        "category": None,
        "source_title": _short_line(identity["title"], 200),
        "creator": _short_line(identity["creator"], 160),
        "title": title,
        "summary": summary,
        "source_scope": scope,
        "evidence_status": source["evidence_status"],
        "terms": json.dumps(terms, ensure_ascii=False),
        "search_text": _normalized_search_text([title, notes_for_search, (authored or {}).get("summary", ""), *terms]),
        "declared_consumers": "[]",
        "detail_views": json.dumps(["full"]),
        "source_ref": None,
    })
    return cards


def _catalog_cards(sources: dict[str, dict[str, Any]],
                   atoms: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    cards = []
    for source_id in sorted(sources):
        cards.extend(_material_cards_for_source(sources[source_id]))
    for atom_id in sorted(atoms):
        atom = atoms[atom_id]
        source = sources[atom["source_id"]]
        card = atom["index_card"]
        bindings = atom["consumer_bindings"]
        consumers = list(dict.fromkeys(binding["consumer"] for binding in bindings))
        observed = atom["analysis"]["observed_unit"]
        source_unit_ref = observed.get("source_unit_ref")
        source_ref = ({"type": "material_unit", "source_id": atom["source_id"],
                       "unit_key": source_unit_ref["unit_key"]} if source_unit_ref else None)
        search_fields = [
            atom["category"], source["identity"]["title"], source["identity"]["creator"],
            card["title"], card["summary"], *card.get("terms", []),
            *(" ".join((binding["consumer"], binding["decision"], binding["stage"])) for binding in bindings),
        ]
        source_material = source["source_material"]
        cards.append({
            "card_id": "method:" + atom_id,
            "kind": "method",
            "ref": {"type": "method_atom", "atom_id": atom_id, "source_id": atom["source_id"],
                    "category": atom["category"]},
            "record_revision": _record_revision(atom),
            "source_revision": _record_revision(source),
            "source_id": atom["source_id"],
            "category": atom["category"],
            "source_title": _short_line(source["identity"]["title"], 200),
            "creator": _short_line(source["identity"]["creator"], 160),
            "title": _short_line(card["title"], 240),
            "summary": _short_line(card["summary"], 200),
            "source_scope": json.dumps({
                "access_scope": _short_line(source["provenance"]["access_scope"], 240),
                "read_scope": _short_line(source_material["read_scope"], 240),
            }, ensure_ascii=False, sort_keys=True),
            "evidence_status": atom["evidence_status"],
            "terms": json.dumps(card.get("terms", [])[:32], ensure_ascii=False),
            "search_text": _normalized_search_text(search_fields),
            "declared_consumers": json.dumps(consumers[:64], ensure_ascii=False),
            "detail_views": json.dumps(["decision", "analysis", "full"]),
            "source_ref": json.dumps(source_ref, ensure_ascii=False) if source_ref else None,
            "bindings": bindings,
        })
    return cards


def _catalog_inventory(root: Path) -> dict[str, tuple[str, int, int, int, int]]:
    inventory: dict[str, tuple[str, int, int, int, int]] = {}

    def add(path: Path, kind: str) -> None:
        if path.is_symlink():
            raise LibraryError(f"canonical record is linked: {path}")
        try:
            info = os.lstat(path)
        except OSError as error:
            raise LibraryError(f"cannot inspect canonical record {path}: {error}") from error
        if not os.path.isfile(path) or not stat.S_ISREG(info.st_mode):
            raise LibraryError(f"canonical record is not a regular file: {path}")
        inventory[path.relative_to(root).as_posix()] = (kind, info.st_size, info.st_mtime_ns, info.st_dev, info.st_ino)

    source_dir = root / "sources"
    if source_dir.exists():
        if source_dir.is_symlink() or not source_dir.is_dir():
            raise LibraryError("source record directory is linked or not a directory")
        for path in sorted(source_dir.glob("SRC-*.json")):
            add(path, "source")
    for category_dir in sorted(root.iterdir()):
        if category_dir.name in {"sources", TRANSACTIONS_DIR, "__pycache__"} or category_dir.name.startswith("."):
            continue
        if category_dir.is_symlink():
            raise LibraryError(f"refusing symbolic category path: {category_dir}")
        if not category_dir.is_dir():
            continue
        atom_dir = category_dir / "atoms"
        if not atom_dir.exists():
            continue
        if atom_dir.is_symlink() or not atom_dir.is_dir():
            raise LibraryError(f"atom directory is linked or not a directory: {atom_dir}")
        for path in sorted(atom_dir.glob("ATM-*.json")):
            add(path, "atom")
    return inventory


def _write_catalog(root: Path, sources: dict[str, dict[str, Any]],
                   atoms: dict[str, dict[str, Any]]) -> dict[str, Any]:
    target = _contained(root, CATALOG_NAME)
    if target.exists() and (target.is_symlink() or not target.is_file()):
        raise LibraryError("catalog path is linked or not a regular file")
    temp = _contained(root, f".{CATALOG_NAME}.{uuid.uuid4().hex}.tmp")
    inventory = _catalog_inventory(root)
    cards = _catalog_cards(sources, atoms)
    revision = hashlib.sha256(_canonical({"sources": sources, "atoms": atoms})).hexdigest()
    counts = {"sources": len(sources),
              "material_cards": sum(card["kind"] == "material" for card in cards),
              "method_cards": sum(card["kind"] == "method" for card in cards)}
    try:
        connection = sqlite3.connect(temp)
        try:
            connection.execute("PRAGMA journal_mode=DELETE")
            connection.execute("PRAGMA synchronous=FULL")
            connection.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("CREATE TABLE inventory (path TEXT PRIMARY KEY, kind TEXT NOT NULL, size INTEGER NOT NULL, mtime_ns INTEGER NOT NULL, device INTEGER NOT NULL, inode INTEGER NOT NULL)")
            connection.execute("CREATE TABLE cards (card_id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_json TEXT NOT NULL, record_revision TEXT NOT NULL, source_revision TEXT NOT NULL, source_id TEXT NOT NULL, category TEXT, source_title TEXT NOT NULL, creator TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, source_scope TEXT NOT NULL, evidence_status TEXT NOT NULL, terms_json TEXT NOT NULL, search_text TEXT NOT NULL, declared_consumers_json TEXT NOT NULL, detail_views_json TEXT NOT NULL, source_ref_json TEXT)")
            connection.execute("CREATE INDEX cards_kind ON cards(kind)")
            connection.execute("CREATE INDEX cards_category ON cards(category)")
            connection.execute("CREATE TABLE bindings (card_id TEXT NOT NULL, consumer TEXT NOT NULL, decision TEXT NOT NULL, decision_norm TEXT NOT NULL, stage TEXT NOT NULL, binding_json TEXT NOT NULL)")
            connection.execute("CREATE INDEX bindings_consumer ON bindings(consumer, card_id)")
            connection.execute("CREATE INDEX bindings_decision ON bindings(decision_norm, card_id)")
            connection.execute("CREATE INDEX bindings_stage ON bindings(stage, card_id)")
            metadata = {
                "catalog_format_version": str(CATALOG_FORMAT_VERSION),
                "revision": revision,
                "built_at": _utc_now(),
                "source_count": str(counts["sources"]),
                "material_card_count": str(counts["material_cards"]),
                "method_card_count": str(counts["method_cards"]),
            }
            connection.executemany("INSERT INTO metadata(key,value) VALUES(?,?)", metadata.items())
            connection.executemany("INSERT INTO inventory VALUES(?,?,?,?,?,?)", [
                (path, kind, size, mtime_ns, device, inode)
                for path, (kind, size, mtime_ns, device, inode) in sorted(inventory.items())
            ])
            for card in cards:
                connection.execute("INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    card["card_id"], card["kind"], json.dumps(card["ref"], ensure_ascii=False, sort_keys=True),
                    card["record_revision"], card["source_revision"], card["source_id"], card["category"],
                    card["source_title"], card["creator"], card["title"], card["summary"], card["source_scope"],
                    card["evidence_status"], card["terms"], card["search_text"], card["declared_consumers"],
                    card["detail_views"], card["source_ref"],
                ))
                for binding in card.get("bindings", []):
                    connection.execute("INSERT INTO bindings VALUES(?,?,?,?,?,?)", (
                        card["card_id"], binding["consumer"], binding["decision"],
                        unicodedata.normalize("NFKC", binding["decision"]).casefold(), binding["stage"],
                        json.dumps(binding, ensure_ascii=False, sort_keys=True),
                    ))
            connection.commit()
        finally:
            connection.close()
        with temp.open("rb") as stream:
            os.fsync(stream.fileno())
        os.replace(temp, target)
        with contextlib.suppress(OSError):
            directory_fd = os.open(root, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    except Exception:
        with contextlib.suppress(OSError):
            temp.unlink()
        raise
    return {"status": "rebuilt", "path": CATALOG_NAME, "revision": revision, **counts}


def _pending_entries(root: Path) -> list[str]:
    tx_dir = _contained(root, TRANSACTIONS_DIR)
    if not tx_dir.exists():
        return []
    if tx_dir.is_symlink() or not tx_dir.is_dir():
        raise LibraryError("transaction path is linked or not a directory")
    return sorted(path.name for path in tx_dir.iterdir())


def _catalog_assessment(root: Path) -> dict[str, Any]:
    checked_at = _utc_now()
    base = {"path": CATALOG_NAME, "freshness_basis": "canonical record path, size, mtime_ns, device and inode; not a full content audit",
            "freshness_checked_at": checked_at, "writes_performed": False}
    if not root.is_dir():
        return {**base, "catalog_state": "missing", "error": "library root does not exist"}
    try:
        pending = _pending_entries(root)
        if pending:
            return {**base, "catalog_state": "pending", "pending_transactions": pending,
                    "error": "pending transaction entries exist; inspect and run recover explicitly"}
        target = _contained(root, CATALOG_NAME)
        if not target.exists():
            return {**base, "catalog_state": "missing", "error": "progressive catalog does not exist; run rebuild-index explicitly"}
        if target.is_symlink() or not target.is_file():
            return {**base, "catalog_state": "invalid", "error": "catalog path is linked or not a regular file"}
        connection = sqlite3.connect(target.resolve().as_uri() + "?mode=ro", uri=True)
        try:
            metadata = dict(connection.execute("SELECT key,value FROM metadata"))
            if metadata.get("catalog_format_version") != str(CATALOG_FORMAT_VERSION):
                return {**base, "catalog_state": "incompatible", "error": "progressive catalog format is incompatible; run rebuild-index explicitly"}
            stored = {row[0]: (row[1], row[2], row[3], row[4], row[5])
                      for row in connection.execute("SELECT path,kind,size,mtime_ns,device,inode FROM inventory")}
        finally:
            connection.close()
        current = _catalog_inventory(root)
        if stored != current:
            return {**base, "catalog_state": "stale", "catalog_revision": metadata.get("revision"),
                    "indexed_counts": {"sources": int(metadata.get("source_count", "0")),
                                       "material_cards": int(metadata.get("material_card_count", "0")),
                                       "method_cards": int(metadata.get("method_card_count", "0"))},
                    "counts_are_current": False,
                    "error": "canonical record inventory changed; run rebuild-index explicitly"}
        return {**base, "catalog_state": "current", "catalog_revision": metadata["revision"],
                "indexed_counts": {"sources": int(metadata.get("source_count", "0")),
                                   "material_cards": int(metadata.get("material_card_count", "0")),
                                   "method_cards": int(metadata.get("method_card_count", "0"))},
                "counts_are_current": True}
    except (OSError, sqlite3.Error, LibraryError, KeyError, ValueError) as error:
        return {**base, "catalog_state": "invalid", "error": str(error)}


def info(library_root: str | os.PathLike[str]) -> dict[str, Any]:
    root = _absolute_root(library_root)
    return {"library_root": str(root), **_catalog_assessment(root)}


def _decode_cursor(cursor: str) -> dict[str, Any]:
    try:
        payload = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        value = json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeError, json.JSONDecodeError) as error:
        raise LibraryError("invalid query cursor; restart from the first page") from error
    if not isinstance(value, dict) or value.get("version") != 1 or type(value.get("offset")) is not int or value["offset"] < 0:
        raise LibraryError("invalid query cursor; restart from the first page")
    return value


def _encode_cursor(value: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(_canonical(value)).decode("ascii").rstrip("=")


def _query_filter_clause(*, kind: str, category: str | None, for_consumer: str | None,
                         registered_only: bool, consumer: str | None,
                         decision: str | None, stage: str | None) -> tuple[str, list[Any]]:
    clauses = []
    params: list[Any] = []
    effective_kind = "method" if registered_only else kind
    if effective_kind != "all":
        clauses.append("c.kind=?")
        params.append(effective_kind)
    if category:
        clauses.append("c.category=?")
        params.append(category)
    strict_consumer = consumer or (for_consumer if registered_only else None)
    if strict_consumer or decision or stage:
        binding_clauses = ["b.card_id=c.card_id"]
        binding_params: list[Any] = []
        if strict_consumer:
            binding_clauses.append("b.consumer=?")
            binding_params.append(strict_consumer)
        if decision:
            binding_clauses.append("instr(b.decision_norm,?)>0")
            binding_params.append(unicodedata.normalize("NFKC", decision).casefold())
        if stage:
            binding_clauses.append("b.stage=?")
            binding_params.append(stage)
        clauses.append("EXISTS (SELECT 1 FROM bindings b WHERE " + " AND ".join(binding_clauses) + ")")
        params.extend(binding_params)
    return (" AND ".join(clauses) if clauses else "1=1"), params


def query(library_root: str | os.PathLike[str], query_text: str, *, kind: str = "all",
          category: str | None = None, for_consumer: str | None = None,
          registered_only: bool = False, consumer: str | None = None,
          decision: str | None = None, stage: str | None = None,
          limit: int = 10, cursor: str | None = None) -> dict[str, Any]:
    root = _absolute_root(library_root)
    if kind not in {"all", "material", "method"}:
        raise LibraryError("kind must be all, material or method")
    if type(limit) is not int or not 1 <= limit <= 100:
        raise LibraryError("limit must be an integer between 1 and 100")
    if not isinstance(query_text, str) or not _search_terms(query_text):
        raise LibraryError("enter at least one searchable term")
    if category is not None and not _valid_category(category):
        raise LibraryError("invalid category filter")
    for label, value in (("for-consumer", for_consumer), ("consumer", consumer)):
        if value is not None and (not isinstance(value, str) or not CONSUMER.fullmatch(value)):
            raise LibraryError(f"invalid {label} filter")
    if decision is not None and (not isinstance(decision, str) or not decision.strip()):
        raise LibraryError("decision filter must be a non-empty string")
    if stage is not None and (not isinstance(stage, str) or not stage.strip()):
        raise LibraryError("stage filter must be a non-empty string")
    if type(registered_only) is not bool:
        raise LibraryError("registered_only must be boolean")
    if registered_only and not (for_consumer or consumer):
        raise LibraryError("registered-only requires an explicit consumer target")
    if registered_only and kind == "material":
        raise LibraryError("registered-only cannot be combined with kind=material")
    if for_consumer and consumer and for_consumer != consumer:
        raise LibraryError("--for-consumer and --consumer conflict; use one target")
    target_consumer = for_consumer or consumer
    assessment = _catalog_assessment(root)
    if assessment["catalog_state"] != "current":
        raise LibraryError(assessment.get("error", f"progressive catalog is {assessment['catalog_state']}"))
    revision = assessment["catalog_revision"]
    filter_payload = {
        "query": unicodedata.normalize("NFKC", query_text).casefold().strip(),
        "kind": kind, "category": category, "for_consumer": for_consumer,
        "registered_only": registered_only, "consumer": consumer,
        "decision": unicodedata.normalize("NFKC", decision).casefold() if decision else None,
        # SQL stage filtering is exact, so the cursor key must preserve case too.
        "stage": stage if stage is not None else None, "limit": limit,
    }
    filter_hash = hashlib.sha256(_canonical(filter_payload)).hexdigest()
    offset = 0
    if cursor:
        payload = _decode_cursor(cursor)
        if payload.get("revision") != revision:
            raise LibraryError("query cursor belongs to an older library revision; restart from the first page")
        if payload.get("filter_hash") != filter_hash:
            raise LibraryError("query cursor does not match this query or filter; restart from the first page")
        offset = payload["offset"]

    terms = _search_terms(query_text)
    score_parts = ["CASE WHEN instr(c.search_text,?)>0 THEN 100 ELSE 0 END"]
    score_params: list[Any] = [unicodedata.normalize("NFKC", query_text).casefold().strip()]
    score_parts.extend("(instr(c.search_text,?)>0)*10" for _ in terms)
    score_params.extend(terms)
    if target_consumer:
        score_parts.append("CASE WHEN EXISTS (SELECT 1 FROM bindings pref WHERE pref.card_id=c.card_id AND pref.consumer=?) THEN 25 ELSE 0 END")
        score_params.append(target_consumer)
    where_clause, where_params = _query_filter_clause(
        kind=kind, category=category, for_consumer=for_consumer,
        registered_only=registered_only, consumer=consumer, decision=decision, stage=stage,
    )
    term_clause = "(" + " OR ".join("instr(c.search_text,?)>0" for _ in terms) + ")"
    term_params = list(terms)
    select = "SELECT c.card_id,c.kind,c.ref_json,c.record_revision,c.source_revision,c.source_id,c.category,c.source_title,c.creator,c.title,c.summary,c.source_scope,c.evidence_status,c.terms_json,c.declared_consumers_json,c.detail_views_json,c.source_ref_json, (" + " + ".join(score_parts) + ") AS score FROM cards c WHERE " + where_clause + " AND " + term_clause
    base_params = score_params + where_params + term_params
    catalog_path = _contained(root, CATALOG_NAME)
    connection = sqlite3.connect(catalog_path.resolve().as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(select + " ORDER BY score DESC,c.card_id ASC LIMIT ? OFFSET ?",
                                  base_params + [limit + 1, offset]).fetchall()
    except sqlite3.Error as error:
        raise LibraryError(f"cannot query progressive catalog: {error}") from error
    finally:
        connection.close()
    has_more = len(rows) > limit
    cards = []
    for row in rows[:limit]:
        declared = json.loads(row["declared_consumers_json"])
        consumer_status = ("not-applicable" if row["kind"] == "material" else
                          "registered" if target_consumer in declared else
                          "not-registered" if target_consumer else "not-requested")
        card = {
            "kind": row["kind"], "ref": json.loads(row["ref_json"]),
            "revision": row["record_revision"], "source_revision": row["source_revision"],
            "catalog_revision": revision, "title": row["title"], "summary": row["summary"],
            "source": {"source_id": row["source_id"], "title": row["source_title"], "creator": row["creator"]},
            "source_scope": json.loads(row["source_scope"]),
            "category": row["category"], "declared_consumers": declared,
            "consumer_status": consumer_status, "evidence_status": row["evidence_status"],
            "available_views": json.loads(row["detail_views_json"]),
            "source_ref": json.loads(row["source_ref_json"]) if row["source_ref_json"] else None,
            "score": row["score"],
        }
        if len(_canonical(card)) > MAX_QUERY_CARD_BYTES:
            raise LibraryError(
                "query candidate metadata exceeds the 16 KiB serialized-card budget; candidate not returned"
            )
        cards.append(card)
    next_cursor = (_encode_cursor({"version": 1, "revision": revision, "filter_hash": filter_hash,
                                   "offset": offset + len(cards)}) if has_more else None)
    return {"revision": revision, "cards": cards, "returned_count": len(cards),
            "has_more": has_more, "next_cursor": next_cursor,
            "writes_performed": False}


def _rebuild_index_unlocked(root: Path) -> dict[str, Any]:
    if not root.is_dir():
        raise LibraryError("library root does not exist; reads and index rebuild do not create it")
    recovered_pending = list((root / TRANSACTIONS_DIR).glob("TXN-*/journal.json")) if (root / TRANSACTIONS_DIR).exists() else []
    if recovered_pending:
        raise LibraryError("pending batch transaction exists; run recover before rebuilding the index")
    sources, atoms = _read_all_valid(root)
    categories = sorted({atom["category"] for atom in atoms.values()})
    indexes = [_write_category_index(root, category, sources, atoms) for category in categories]
    catalog = _write_catalog(root, sources, atoms)
    return {"status": "rebuilt", "sources": len(sources), "atoms": len(atoms),
            "categories": categories, "indexes": indexes, "catalog": catalog}


def put_bundle(library_root: str | os.PathLike[str], bundle: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(bundle, dict):
        raise LibraryError("put input must be a JSON object")
    root = _absolute_root(library_root)
    if root.exists() and (root.is_symlink() or not root.is_dir()):
        raise LibraryError("library root is linked or not a directory")
    if "source" in bundle:
        sources_in = [bundle["source"]]
    elif "sources" in bundle:
        sources_in = bundle["sources"]
    else:
        sources_in = []
    if "atom" in bundle:
        atoms_in = [bundle["atom"]]
    elif "atoms" in bundle:
        atoms_in = bundle["atoms"]
    else:
        atoms_in = []
    if not isinstance(sources_in, list) or not sources_in or any(not isinstance(x, dict) for x in sources_in):
        raise LibraryError("put input must contain a source object or a nonempty sources array")
    if not isinstance(atoms_in, list) or any(not isinstance(x, dict) for x in atoms_in):
        raise LibraryError("atom must be an object; atoms must be an array of objects when provided")
    sources = [_validate_source(item, add_id=True) for item in sources_in]
    for source in sources:
        _validate_new_unit_extensions(source)
    sources_by_id = {item["source_id"]: item for item in sources}
    if len(sources_by_id) != len(sources):
        unique_sources: dict[str, dict[str, Any]] = {}
        for source in sources:
            old = unique_sources.get(source["source_id"])
            if old and _semantic_record(old) != _semantic_record(source):
                raise LibraryError(f"conflicting duplicate source in batch: {source['source_id']}")
            unique_sources[source["source_id"]] = source
        sources = list(unique_sources.values())
        sources_by_id = unique_sources
    default_source = sources[0]["source_id"] if len(sources) == 1 else None
    atoms = [_validate_atom(item, add_id=True, default_source=default_source) for item in atoms_in]
    for atom in atoms:
        if atom["source_id"] not in sources_by_id and not source_path(root, atom["source_id"]).is_file():
            raise LibraryError(f"atom references a source absent from this batch and library: {atom['source_id']}")
    if len({item["atom_id"] for item in atoms}) != len(atoms):
        raise LibraryError("duplicate atom IDs in batch")
    _safe_mkdir(root, root.parent)
    with LibraryLock(root):
        _recover_unlocked(root)
        existing_sources = _all_sources(root)
        existing_atoms = _all_atoms(root)
        source_universe = {**existing_sources, **sources_by_id}
        for atom in atoms:
            source = source_universe.get(atom["source_id"])
            if source is not None:
                _validate_atom_source_link(atom, source)
        for record in sources:
            old = existing_sources.get(record["source_id"])
            if old and _semantic_record(old) != _semantic_record(record):
                raise LibraryError(f"source ID already belongs to different content: {record['source_id']}")
        fingerprints = {_atom_fingerprint(atom): atom_id for atom_id, atom in existing_atoms.items()}
        deduped_atoms: list[dict[str, Any]] = []
        duplicate_ids: list[str] = []
        for atom in atoms:
            prior = fingerprints.get(_atom_fingerprint(atom))
            if prior:
                old = existing_atoms[prior]
                comparable = dict(atom)
                comparable["atom_id"] = old["atom_id"]
                if _semantic_record(old) != _semantic_record(comparable):
                    raise LibraryError(
                        f"same source unit and method already exist with different bindings/details: {prior}; "
                        "explicitly revise the record before reusing it"
                    )
                duplicate_ids.append(prior)
                continue
            old = existing_atoms.get(atom["atom_id"])
            if old:
                if _semantic_record(old) != _semantic_record(atom):
                    raise LibraryError(f"atom ID already belongs to different content: {atom['atom_id']}")
                duplicate_ids.append(atom["atom_id"])
            else:
                fingerprints[_atom_fingerprint(atom)] = atom["atom_id"]
                deduped_atoms.append(atom)
        to_write: list[tuple[str, dict[str, Any]]] = []
        for record in sources:
            if record["source_id"] not in existing_sources:
                record.setdefault("added_at", _utc_now())
                to_write.append((f"sources/{record['source_id']}.json", record))
        for atom in deduped_atoms:
            atom.setdefault("created_at", _utc_now())
            to_write.append((f"{atom['category']}/atoms/{atom['atom_id']}.json", atom))
        written: list[Path] = []
        if to_write:
            txid = _make_staged(root, to_write)
            written = _commit_staged(root, txid)
    index_result: dict[str, Any]
    try:
        with LibraryLock(root):
            rebuilt = _rebuild_index_unlocked(root)
            index_result = {key: value for key, value in rebuilt.items() if key != "catalog"}
            catalog_result = rebuilt["catalog"]
    except Exception as error:
        index_result = {"status": "stale-or-unavailable", "error": str(error)}
        catalog_result = {"status": "stale-or-unavailable", "error": str(error)}
    return {
        "source_committed": True,
        "source_ids": [source["source_id"] for source in sources],
        "atom_ids": [atom["atom_id"] for atom in deduped_atoms] + duplicate_ids,
        "files_written": [path.relative_to(root).as_posix() for path in written],
        "idempotent_or_deduplicated_atoms": duplicate_ids,
        "index": index_result,
        "catalog": catalog_result,
        "note": "JSON/JSONL records are canonical; SQLite is a private rebuildable cache.",
    }


def _load_atom_record(root: Path, atom_id: str, category: str | None) -> dict[str, Any]:
    if not isinstance(atom_id, str) or not ATOM_ID.fullmatch(atom_id):
        raise LibraryError("invalid atom ID")
    if category:
        return _validate_atom(_load_json(atom_path(root, category, atom_id)))
    matches = []
    if root.exists():
        for category_dir in root.iterdir():
            if category_dir.is_symlink():
                raise LibraryError(f"refusing symbolic category path while resolving atom: {category_dir}")
            if not category_dir.is_dir() or not _valid_category(category_dir.name):
                continue
            candidate = _contained(root, f"{category_dir.name}/atoms/{atom_id}.json")
            if candidate.exists():
                if candidate.is_symlink() or not candidate.is_file():
                    raise LibraryError(f"atom path is linked or not a regular file: {candidate}")
                matches.append(candidate)
    if len(matches) != 1:
        raise LibraryError("atom not found or ID is ambiguous; provide --category")
    return _validate_atom(_load_json(matches[0]))


def _source_basis(source: dict[str, Any]) -> dict[str, Any]:
    material = source["source_material"]
    basis = {
        "source_id": source["source_id"],
        "identity": source["identity"],
        "identity_basis": source["provenance"]["identity_basis"],
        "locator": source["provenance"]["locator"],
        "access_scope": source["provenance"]["access_scope"],
        "evidence_status": source["evidence_status"],
        "source_material": {key: material[key] for key in ("reference_kind", "version", "read_scope", "content_sha256") if key in material},
    }
    return basis


def _binding_matches(binding: dict[str, Any], *, consumer: str | None,
                     decision: str | None, stage: str | None,
                     decision_substring: bool = False) -> bool:
    if consumer is not None and binding["consumer"] != consumer:
        return False
    if decision is not None:
        if decision_substring:
            if unicodedata.normalize("NFKC", decision).casefold() not in unicodedata.normalize(
                    "NFKC", binding["decision"]).casefold():
                return False
        elif binding["decision"] != decision:
            return False
    if stage is not None and binding["stage"] != stage:
        return False
    return True


def _detail_revision(record_revision: str, basis_revision: str, view: str,
                     filters: dict[str, Any] | None = None) -> str:
    return hashlib.sha256(_canonical({"record_revision": record_revision,
                                      "basis_revision": basis_revision,
                                      "view": view, "filters": filters or {}})).hexdigest()


def _atom_detail(record: dict[str, Any], root: Path, *, view: str,
                 consumer: str | None = None, decision: str | None = None,
                 stage: str | None = None) -> dict[str, Any]:
    source = _validate_source(_load_json(source_path(root, record["source_id"])))
    _validate_atom_source_link(record, source)
    record_revision = _record_revision(record)
    basis_revision = _record_revision(source)
    filters = {"consumer": consumer, "decision": decision, "stage": stage}
    revision = _detail_revision(record_revision, basis_revision, view, filters)
    observed = record["analysis"]["observed_unit"]
    unit_reference = observed.get("source_unit_ref")
    source_link = ({"type": "material_unit", "source_id": record["source_id"],
                    "unit_key": unit_reference["unit_key"]} if unit_reference else None)
    source_basis = _source_basis(source)
    source_basis["unit_linkage"] = "declared" if source_link else "unknown"
    source_basis["source_ref"] = source_link
    common = {
        "ref": {"type": "method_atom", "atom_id": record["atom_id"],
                "source_id": record["source_id"], "category": record["category"]},
        "revision": revision, "record_revision": record_revision,
        "basis_revision": basis_revision, "view": view, "source_basis": source_basis,
    }
    if view == "analysis":
        return {**common, "atom": record}
    if view != "decision":
        raise LibraryError("atom view must be decision or analysis")
    if consumer is not None and not CONSUMER.fullmatch(consumer):
        raise LibraryError("invalid consumer filter")
    if decision is not None and (not isinstance(decision, str) or not decision.strip()):
        raise LibraryError("decision filter must be non-empty")
    if stage is not None and (not isinstance(stage, str) or not stage.strip()):
        raise LibraryError("stage filter must be non-empty")
    requested = any(value is not None for value in (consumer, decision, stage))
    matches = [binding for binding in record["consumer_bindings"]
               if _binding_matches(binding, consumer=consumer, decision=decision, stage=stage)]
    assessments = record["analysis"].get("transfer_assessments", [])
    if isinstance(assessments, list):
        assessments = [item for item in assessments if isinstance(item, dict)
                       and (consumer is None or item.get("consumer") == consumer)
                       and (decision is None or item.get("decision") == decision)
                       and (stage is None or item.get("stage") == stage)]
    else:
        assessments = []
    return {
        **common,
        "method": {"category": record["category"], "index_card": record["index_card"],
                   "evidence_status": record["evidence_status"]},
        "relation": {
            "observed_unit": observed,
            "visible_observations": record["analysis"]["visible_observations"],
            "creator_statement": record["analysis"].get("creator_statement"),
            "mechanism_inference": record["analysis"]["mechanism_inference"],
        },
        "conditions": record["analysis"]["conditions"],
        "effect_evidence": record["analysis"]["effect_evidence"],
        "binding_context": {
            "status": ("registered" if matches else "not-registered") if requested else "not-requested",
            "requested": {key: value for key, value in filters.items() if value is not None},
            "matches": matches if requested else record["consumer_bindings"],
        },
        "transfer_assessments": assessments,
        **({"common_conditions": record["analysis"]["conditions"]} if requested and not matches else {}),
    }


def get_atom(library_root: str | os.PathLike[str], atom_id: str, category: str | None = None, *,
             view: str | None = None, consumer: str | None = None,
             decision: str | None = None, stage: str | None = None) -> dict[str, Any]:
    root = _absolute_root(library_root)
    record = _load_atom_record(root, atom_id, category)
    if view is None:
        if any(value is not None for value in (consumer, decision, stage)):
            raise LibraryError("binding selectors require --view decision")
        return record
    if view not in {"decision", "analysis"}:
        raise LibraryError("atom view must be decision or analysis")
    if view == "analysis" and any(value is not None for value in (consumer, decision, stage)):
        raise LibraryError("binding selectors are only supported with --view decision")
    return _atom_detail(record, root, view=view, consumer=consumer, decision=decision, stage=stage)


def _verified_unit_excerpt(source: dict[str, Any], unit: dict[str, Any]) -> str | None:
    span = unit.get("verified_span")
    excerpt = source["source_material"].get("captured_excerpt")
    if not isinstance(span, dict) or not isinstance(excerpt, str):
        return None
    if span.get("source_version") != source["source_material"].get("version"):
        return None
    start, end = span.get("start"), span.get("end")
    if type(start) is not int or type(end) is not int or start < 0 or end <= start or end > len(excerpt):
        return None
    text = excerpt[start:end]
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return text if digest.casefold() == str(span.get("sha256", "")).casefold() else None


def _source_unit_detail(source: dict[str, Any], unit: dict[str, Any], *, view: str) -> dict[str, Any]:
    if view not in {"identity", "material", "analysis"}:
        raise LibraryError("source unit view must be identity, material or analysis")
    unit_key = unit["unit"]
    source_revision = _record_revision(source)
    unit_revision = _record_revision(unit)
    revision = _detail_revision(unit_revision, source_revision, view)
    provenance = source["provenance"]
    locator = unit.get("locator") if isinstance(unit.get("locator"), str) and unit["locator"].strip() else provenance["locator"]
    unit_metadata = {key: unit[key] for key in ("unit", "title", "disposition", "locator", "index_card") if key in unit}
    verified_excerpt = _verified_unit_excerpt(source, unit)
    result = {
        "ref": {"type": "material_unit", "source_id": source["source_id"], "unit_key": unit_key},
        "revision": revision, "record_revision": unit_revision,
        "basis_revision": source_revision, "view": view,
        "identity": source["identity"], "evidence_status": source["evidence_status"],
        "source_basis": {"identity_basis": provenance["identity_basis"],
                         "locator": provenance["locator"], "access_scope": provenance["access_scope"]},
        "unit": unit_metadata, "locator": locator,
        "raw_excerpt_available": verified_excerpt is not None,
    }
    if view == "material":
        material = source["source_material"]
        result["source_material"] = {key: material[key] for key in ("reference_kind", "version", "read_scope", "content_sha256") if key in material}
        if verified_excerpt is not None:
            result["raw_excerpt"] = verified_excerpt
    elif view == "analysis" and "analysis" in unit:
        result["analysis"] = unit["analysis"]
    return result


def get_source(library_root: str | os.PathLike[str], source_id: str, *,
               unit: str | None = None, view: str | None = None) -> dict[str, Any]:
    root = _absolute_root(library_root)
    source = _validate_source(_load_json(source_path(root, source_id)))
    if unit is None:
        if view is not None:
            raise LibraryError("--view requires --unit; omit both to read the full source record")
        return source
    if not isinstance(unit, str) or not unit.strip():
        raise LibraryError("unit key must be a non-empty string")
    units = source.get("provenance", {}).get("independent_units")
    if not isinstance(units, list) or not units:
        raise LibraryError("source has no independently addressable units; use get-source without --unit")
    matches = [candidate for candidate in units if isinstance(candidate, dict) and candidate.get("unit") == unit]
    if not matches:
        mode, _ = _stable_source_units(source)
        if mode == "whole-source":
            raise LibraryError("source units lack stable keys; use get-source without --unit")
        raise LibraryError(f"source unit key not found: {unit}")
    if len(matches) != 1:
        raise LibraryError(f"source unit key is ambiguous: {unit}")
    return _source_unit_detail(source, matches[0], view=view or "material")


def _search_terms(query: str) -> list[str]:
    normalized = unicodedata.normalize("NFKC", query).casefold().strip()
    if not normalized:
        return []
    terms = []
    for part in re.findall(r"[\u4e00-\u9fff]+|[a-z0-9]+", normalized):
        if re.fullmatch(r"[\u4e00-\u9fff]+", part):
            if len(part) == 1:
                terms.append(part)
            else:
                terms.extend(part[i:i + 2] for i in range(len(part) - 1))
        else:
            terms.append(part)
    return list(dict.fromkeys(terms))


def search(library_root: str | os.PathLike[str], query: str, *, consumer: str | None = None,
           decision: str | None = None, stage: str | None = None, category: str | None = None,
           limit: int = 10) -> list[dict[str, Any]]:
    root = _absolute_root(library_root)
    if not 1 <= limit <= 100:
        raise LibraryError("limit must be between 1 and 100")
    query_terms = _search_terms(query)
    if not query_terms:
        raise LibraryError("enter at least one searchable term")
    if consumer and not CONSUMER.fullmatch(consumer):
        raise LibraryError("invalid consumer filter")
    if category and not _valid_category(category):
        raise LibraryError("invalid category filter")
    if not root.is_dir():
        raise LibraryError("search index does not exist; run rebuild-index explicitly after adding records")
    sources, atoms = _read_all_valid(root)
    categories = [category] if category else sorted({atom["category"] for atom in atoms.values()})
    if not categories:
        raise LibraryError("search index does not exist; run rebuild-index explicitly after adding records")
    rows = []
    for index_category in categories:
        category_atoms = {atom_id: atom for atom_id, atom in atoms.items() if atom["category"] == index_category}
        source_ids = {atom["source_id"] for atom in category_atoms.values()}
        category_sources = {source_id: sources[source_id] for source_id in source_ids}
        index = _contained(root, f"{index_category}/{INDEX_NAME}")
        if not index.exists():
            raise LibraryError(f"search index for category {index_category} does not exist; run rebuild-index explicitly")
        if index.is_symlink() or not index.is_file():
            raise LibraryError(f"search index for category {index_category} is linked or not a regular file")
        uri = index.resolve().as_uri() + "?mode=ro"
        connection = sqlite3.connect(uri, uri=True)
        try:
            metadata = dict(connection.execute("SELECT key,value FROM metadata"))
            if (metadata.get("format_version") != str(FORMAT_VERSION)
                    or metadata.get("category") != index_category
                    or metadata.get("data_digest") != _index_digest(category_sources, category_atoms)):
                raise LibraryError(f"search index for {index_category} is stale or incompatible; run rebuild-index explicitly")
            rows.extend(connection.execute(
                "SELECT atom_id,source_id,category,source_title,creator,card_title,summary,terms,bindings,evidence_status FROM atoms"
            ).fetchall())
        except sqlite3.Error as error:
            raise LibraryError(f"cannot read index for {index_category}: {error}") from error
        finally:
            connection.close()
    normalized_query = unicodedata.normalize("NFKC", query).casefold().strip()
    found = []
    for row in rows:
        (atom_id, source_id, row_category, source_title, creator, title, summary,
         raw_terms, raw_bindings, state) = row
        if category and row_category != category:
            continue
        terms = json.loads(raw_terms)
        bindings = json.loads(raw_bindings)
        matching_bindings = [binding for binding in bindings
                             if (not consumer or binding["consumer"] == consumer)
                             and (not decision or decision.casefold() in binding["decision"].casefold())
                             and (not stage or stage.casefold() == binding["stage"].casefold())]
        if (consumer or decision or stage) and not matching_bindings:
            continue
        haystack = " ".join((row_category, source_title, creator, title, summary, *terms,
                             *(binding["consumer"] + " " + binding["decision"] + " " + binding["stage"]
                               + " " + binding["adaptation"] for binding in bindings)))
        haystack = unicodedata.normalize("NFKC", haystack).casefold()
        phrase_match = normalized_query in haystack
        matches = sum(1 for term in query_terms if term in haystack)
        if not phrase_match and not matches:
            continue
        score = (100 if phrase_match else 0) + matches * 10
        found.append((score, atom_id, {
            "atom_id": atom_id, "source_id": source_id, "category": row_category,
            "source": {"title": source_title, "creator": creator},
            "index_card": {"title": title, "summary": summary, "terms": terms},
            "consumer_bindings": [{"consumer": binding["consumer"], "decision": binding["decision"],
                                   "stage": binding["stage"]} for binding in
                                  (matching_bindings if consumer or decision or stage else bindings)],
            "evidence_status": state,
        }))
    found.sort(key=lambda item: (-item[0], item[1]))
    return [item[2] for item in found[:limit]]


def search_sources(library_root: str | os.PathLike[str], query: str, *, limit: int = 10) -> list[dict[str, Any]]:
    """Search source catalog metadata without following material references or reading indexes."""
    root = _absolute_root(library_root)
    if type(limit) is not int or not 1 <= limit <= 100:
        raise LibraryError("limit must be an integer between 1 and 100")
    if not isinstance(query, str):
        raise LibraryError("query must be a non-empty string")
    query_terms = _search_terms(query)
    if not query_terms:
        raise LibraryError("enter at least one searchable term")
    if not root.is_dir():
        raise LibraryError("library root does not exist; source search does not create it")
    _contained(root, "sources")

    # Read commands never recover an interrupted write. A pending journal means
    # the canonical records may be in an intermediate state, so stop and let
    # the caller explicitly inspect/recover it.
    tx_dir = _contained(root, TRANSACTIONS_DIR)
    if tx_dir.exists():
        if tx_dir.is_symlink() or not tx_dir.is_dir():
            raise LibraryError("transaction path is linked or not a directory")
        try:
            pending = sorted(tx_dir.iterdir())
        except OSError as error:
            raise LibraryError(f"cannot inspect transaction directory: {error}") from error
        if pending:
            raise LibraryError("pending transaction entries exist; inspect and run recover explicitly")

    try:
        sources = _all_sources(root)
    except OSError as error:
        raise LibraryError(f"cannot read source records: {error}") from error

    normalized_query = unicodedata.normalize("NFKC", query).casefold().strip()
    found = []
    for source_id, source in sources.items():
        title = source["identity"]["title"]
        notes = source.get("notes", "")
        fields = (("identity.title", title), ("notes", notes))
        matched_fields = []
        score = 0
        for field_name, value in fields:
            if not value:
                continue
            haystack = unicodedata.normalize("NFKC", value).casefold()
            phrase_match = normalized_query in haystack
            matches = sum(1 for term in query_terms if term in haystack)
            if phrase_match or matches:
                matched_fields.append(field_name)
                score += (100 if phrase_match else 0) + matches * 10
        if not matched_fields:
            continue
        # `notes` is a catalog description, not source_material. Return it only
        # when it is already short and single-line; long notes stay in get-source.
        summary_value = notes if notes and len(notes) <= 200 and "\n" not in notes and "\r" not in notes else title
        summary = " ".join(summary_value.split())
        if not summary:
            summary = " ".join(title.split())
        if len(summary) > 200:
            summary = summary[:199] + "…"
        found.append((score, source_id, {
            "record_type": "source", "source_id": source_id,
            "identity": source["identity"], "summary": summary,
            "evidence_status": source["evidence_status"],
            "matched_fields": matched_fields,
        }))
    found.sort(key=lambda item: (-item[0], item[1]))
    return [item[2] for item in found[:limit]]


def _usage_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    result = []
    for category_dir in sorted(root.iterdir()):
        if category_dir.name in {"sources", TRANSACTIONS_DIR} or category_dir.name.startswith("."):
            continue
        if category_dir.is_symlink():
            raise LibraryError(f"refusing symbolic category path: {category_dir}")
        usage_dir = category_dir / "usage"
        if not usage_dir.exists():
            continue
        if usage_dir.is_symlink() or not usage_dir.is_dir():
            raise LibraryError(f"usage directory is linked or not a directory: {usage_dir}")
        for path in sorted(usage_dir.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9].jsonl")):
            if path.is_symlink() or not path.is_file():
                raise LibraryError(f"refusing non-file or symbolic link: {path}")
            result.append(path)
    return result


def _validate_usage(record: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise LibraryError("usage record must be an object")
    allowed = {"schema_version", "usage_id", "atom_id", "category", "consumer", "decision", "stage",
               "required_context", "adaptation", "return", "check", "outcome", "recorded_at",
               "case_ref", "result_evidence"}
    if set(record) - allowed:
        raise LibraryError("usage has fields not allowed by usage.schema.json")
    if record.get("schema_version", FORMAT_VERSION) != FORMAT_VERSION:
        raise LibraryError("usage schema_version must be 1")
    if not isinstance(record.get("usage_id"), str) or not USAGE_ID.fullmatch(record["usage_id"]):
        raise LibraryError("usage_id must use USG- plus 16 uppercase hexadecimal digits")
    if not isinstance(record.get("atom_id"), str) or not ATOM_ID.fullmatch(record["atom_id"]):
        raise LibraryError("usage needs a valid atom_id")
    _validate_binding({key: record.get(key) for key in
                       ("consumer", "decision", "stage", "required_context", "adaptation", "return", "check")})
    if not isinstance(record.get("outcome"), str) or record["outcome"] not in USAGE_OUTCOMES:
        raise LibraryError("usage outcome must be applied, adapted, rejected, not-used or pending")
    if not isinstance(record.get("recorded_at"), str) or not record["recorded_at"].strip():
        raise LibraryError("usage needs recorded_at")
    try:
        timestamp = dt.datetime.fromisoformat(record["recorded_at"].replace("Z", "+00:00"))
    except ValueError as error:
        raise LibraryError("usage.recorded_at must be an ISO-8601 timestamp") from error
    if timestamp.tzinfo is None:
        raise LibraryError("usage.recorded_at must include a timezone")
    if "category" in record and not _valid_category(record["category"]):
        raise LibraryError("usage.category must be a lowercase category slug")
    for key in ("case_ref", "result_evidence"):
        if key in record and not isinstance(record[key], str):
            raise LibraryError(f"usage.{key} must be a string")
    return record


def _usage_retry_content(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if key not in {"usage_id", "recorded_at"}}


def _read_usage(root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    records, errors = [], []
    seen = set()
    for path in _usage_files(root):
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            try:
                record = _validate_usage(json.loads(line))
                if record["usage_id"] in seen:
                    raise LibraryError(f"duplicate usage ID: {record['usage_id']}")
                seen.add(record["usage_id"])
                records.append(record)
            except (json.JSONDecodeError, LibraryError) as error:
                errors.append(f"{path}:{line_number}: {error}")
    return records, errors


def log_usage(library_root: str | os.PathLike[str], record: dict[str, Any]) -> dict[str, Any]:
    root = _absolute_root(library_root)
    if not root.is_dir():
        raise LibraryError("library root does not exist; use archive to prepare its workspace first")
    atom = get_atom(root, record.get("atom_id", ""), record.get("category"))
    binding = next((item for item in atom["consumer_bindings"]
                    if item["consumer"] == record.get("consumer") and item["decision"] == record.get("decision")
                    and item["stage"] == record.get("stage")), None)
    if not binding:
        raise LibraryError("usage must match an explicit atom consumer_binding (consumer, decision, stage)")
    usage = dict(record)
    usage.setdefault("schema_version", FORMAT_VERSION)
    usage.setdefault("required_context", binding["required_context"])
    usage.setdefault("adaptation", binding["adaptation"])
    usage.setdefault("return", binding["return"])
    usage.setdefault("check", binding["check"])
    provided_recorded_at = "recorded_at" in record
    usage.setdefault("recorded_at", _utc_now())
    generated_usage_id = not usage.get("usage_id")
    if generated_usage_id:
        usage["usage_id"] = "USG-" + _sha(_usage_retry_content(usage))
    _validate_usage(usage)
    category = atom["category"]
    month = usage["recorded_at"][:7]
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        raise LibraryError("recorded_at must begin with YYYY-MM")
    relative = f"{category}/usage/{month}.jsonl"
    target = _contained(root, relative)
    with LibraryLock(root):
        existing = []
        for usage_path in _usage_files(root):
            lines = usage_path.read_text(encoding="utf-8").splitlines()
            if usage_path == target:
                existing = lines
            for line in lines:
                try:
                    previous = _validate_usage(json.loads(line))
                except (json.JSONDecodeError, LibraryError) as error:
                    raise LibraryError(f"cannot append while usage log is invalid: {usage_path}: {error}") from error
                if previous["usage_id"] == usage["usage_id"]:
                    same_content = _usage_retry_content(previous) == _usage_retry_content(usage)
                    same_explicit_time = not provided_recorded_at or previous["recorded_at"] == usage["recorded_at"]
                    if same_content and same_explicit_time:
                        return {"status": "idempotent", "usage_id": usage["usage_id"],
                                "path": usage_path.relative_to(root).as_posix()}
                    raise LibraryError("usage ID already belongs to different content")
        _safe_mkdir(target.parent, root)
        payload = "\n".join(existing + [json.dumps(usage, ensure_ascii=False, sort_keys=True)]) + "\n"
        temp = _contained(root, f".{uuid.uuid4().hex}.usage.tmp")
        with temp.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, target)
    return {"status": "logged", "usage_id": usage["usage_id"], "path": relative}


def stats(library_root: str | os.PathLike[str]) -> dict[str, Any]:
    root = _absolute_root(library_root)
    sources = _all_sources(root) if root.exists() else {}
    atoms = _all_atoms(root) if root.exists() else {}
    usages, usage_errors = _read_usage(root) if root.exists() else ([], [])
    categories = sorted({atom["category"] for atom in atoms.values()})
    index_categories = [category for category in categories
                        if (root / category / INDEX_NAME).is_file()
                        and not (root / category / INDEX_NAME).is_symlink()]
    return {
        "library_root": str(root), "source_count": len(sources), "atom_count": len(atoms),
        "atoms_by_category": _counts(atom["category"] for atom in atoms.values()),
        "atoms_by_evidence_status": _counts(atom["evidence_status"] for atom in atoms.values()),
        "usage_count": len(usages), "usage_by_outcome": _counts(item["outcome"] for item in usages),
        "usage_errors": usage_errors,
        "index_present": bool(categories) and len(index_categories) == len(categories),
        "index_categories": index_categories,
    }


def _counts(items: Iterable[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for item in items:
        result[item] = result.get(item, 0) + 1
    return dict(sorted(result.items()))


def validate(library_root: str | os.PathLike[str]) -> dict[str, Any]:
    root = _absolute_root(library_root)
    errors: list[str] = []
    sources: dict[str, dict[str, Any]] = {}
    atoms: dict[str, dict[str, Any]] = {}
    try:
        sources, atoms = _read_all_valid(root)
    except LibraryError as error:
        errors.append(str(error))
    usages, usage_errors = _read_usage(root) if root.exists() else ([], [])
    errors.extend(usage_errors)
    for usage in usages:
        if usage["atom_id"] not in atoms:
            errors.append(f"usage {usage['usage_id']} references missing atom {usage['atom_id']}")
        else:
            binding = next((item for item in atoms[usage["atom_id"]]["consumer_bindings"]
                            if item["consumer"] == usage["consumer"] and item["decision"] == usage["decision"]
                            and item["stage"] == usage["stage"]), None)
            if not binding:
                errors.append(f"usage {usage['usage_id']} has no matching consumer binding")
    index_states = {}
    for category in sorted({atom["category"] for atom in atoms.values()}):
        index = _contained(root, f"{category}/{INDEX_NAME}")
        if not index.exists():
            index_states[category] = "missing"
            errors.append(f"{category} search index is missing; run rebuild-index")
            continue
        if index.is_symlink() or not index.is_file():
            index_states[category] = "unsafe"
            errors.append(f"{category} index path is linked or not a regular file")
            continue
        try:
            connection = sqlite3.connect(index.resolve().as_uri() + "?mode=ro", uri=True)
            metadata = dict(connection.execute("SELECT key,value FROM metadata"))
            connection.close()
            category_atoms = {atom_id: atom for atom_id, atom in atoms.items() if atom["category"] == category}
            source_ids = {atom["source_id"] for atom in category_atoms.values()}
            category_sources = {source_id: sources[source_id] for source_id in source_ids if source_id in sources}
            expected = _index_digest(category_sources, category_atoms)
            current = (metadata.get("format_version") == str(FORMAT_VERSION)
                       and metadata.get("category") == category
                       and metadata.get("data_digest") == expected)
            index_states[category] = "current" if current else "stale"
            if not current:
                errors.append(f"{category} index cache is stale or incompatible; run rebuild-index")
        except sqlite3.Error as error:
            errors.append(f"{category} index cache is unreadable: {error}")
            index_states[category] = "invalid"
    tx_dir = root / TRANSACTIONS_DIR
    pending = []
    if tx_dir.exists() and tx_dir.is_dir() and not tx_dir.is_symlink():
        pending = sorted(path.name for path in tx_dir.iterdir())
        if pending:
            errors.append("pending transactions exist; run recover")
    if not index_states:
        index_state = "empty"
    elif all(state == "current" for state in index_states.values()):
        index_state = "current"
    elif any(state in {"invalid", "unsafe"} for state in index_states.values()):
        index_state = "invalid"
    elif any(state == "stale" for state in index_states.values()):
        index_state = "stale"
    else:
        index_state = "missing"
    catalog_assessment = _catalog_assessment(root)
    if (sources or atoms) and catalog_assessment["catalog_state"] != "current":
        errors.append(catalog_assessment.get("error", "progressive catalog is not current"))
    return {"ok": not errors, "source_count": len(sources), "atom_count": len(atoms),
            "usage_count": len(usages), "index_state": index_state, "index_states": index_states,
            "catalog_state": catalog_assessment["catalog_state"],
            "catalog_revision": catalog_assessment.get("catalog_revision"),
            "pending_transactions": pending,
            "errors": errors, "writes_performed": False}


def rebuild_index(library_root: str | os.PathLike[str]) -> dict[str, Any]:
    root = _absolute_root(library_root)
    if not root.is_dir():
        raise LibraryError("library root does not exist; read commands and rebuild-index do not create it")
    with LibraryLock(root):
        return _rebuild_index_unlocked(root)


def recover(library_root: str | os.PathLike[str]) -> dict[str, Any]:
    root = _absolute_root(library_root)
    if not root.is_dir():
        raise LibraryError("library root does not exist; use archive to prepare its workspace first")
    with LibraryLock(root):
        recovered = _recover_unlocked(root)
    return {"recovered": recovered, "writes_performed": bool(recovered)}


def _load_bundle(path: str) -> dict[str, Any]:
    try:
        if path == "-":
            value = json.load(sys.stdin)
        else:
            value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LibraryError(f"cannot read put JSON: {error}") from error
    if not isinstance(value, dict):
        raise LibraryError("put input must be a JSON object")
    return value


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library-root", required=True, help="Exact path returned by laohu-archive; never inferred from the installed Skill")
    sub = parser.add_subparsers(dest="command", required=True)
    put = sub.add_parser("put", help="save a source alone or with method atoms")
    put.add_argument("--input", required=True, help="JSON source bundle with optional atoms, or - for stdin")
    query = sub.add_parser("search", help="search the legacy category indexes (compatibility API)")
    query.add_argument("query")
    query.add_argument("--consumer")
    query.add_argument("--decision")
    query.add_argument("--stage")
    query.add_argument("--category")
    query.add_argument("--limit", type=int, default=10)
    source_query = sub.add_parser("search-sources", help="search source titles and catalog notes without writing")
    source_query.add_argument("query")
    source_query.add_argument("--limit", type=int, default=10)
    progressive_info = sub.add_parser("info", help="read progressive catalog freshness and indexed counts")
    progressive_query = sub.add_parser("query", help="search bounded material and method cards from the progressive catalog")
    progressive_query.add_argument("query")
    progressive_query.add_argument("--kind", choices=("all", "material", "method"), default="all")
    progressive_query.add_argument("--category")
    progressive_query.add_argument("--for-consumer", dest="for_consumer")
    progressive_query.add_argument("--registered-only", action="store_true")
    progressive_query.add_argument("--consumer", help="strict exact binding filter")
    progressive_query.add_argument("--decision", help="strict same-binding decision substring filter")
    progressive_query.add_argument("--stage", help="strict exact same-binding stage filter")
    progressive_query.add_argument("--limit", type=int, default=10)
    progressive_query.add_argument("--cursor")
    atom = sub.add_parser("get-atom", help="read one atom; optional decision or analysis detail view")
    atom.add_argument("atom_id")
    atom.add_argument("--category")
    atom.add_argument("--view", choices=("decision", "analysis"))
    atom.add_argument("--consumer")
    atom.add_argument("--decision")
    atom.add_argument("--stage")
    source = sub.add_parser("get-source", help="read a complete source or one stable unit view")
    source.add_argument("source_id")
    source.add_argument("--unit", help="exact stable key from provenance.independent_units[].unit")
    source.add_argument("--view", choices=("identity", "material", "analysis"))
    usage = sub.add_parser("log-usage", help="append an idempotent use outcome")
    usage.add_argument("--input", required=True, help="JSON usage record path, or - for stdin")
    sub.add_parser("stats", help="count library records without changing them")
    sub.add_parser("validate", help="validate canonical files and report index freshness; read-only")
    sub.add_parser("rebuild-index", help="explicitly rebuild the disposable SQLite search cache")
    sub.add_parser("recover", help="roll back any interrupted uncommitted batch")
    return parser


def run(args: argparse.Namespace) -> Any:
    root = args.library_root
    if args.command == "put":
        return put_bundle(root, _load_bundle(args.input))
    if args.command == "search":
        return search(root, args.query, consumer=args.consumer, decision=args.decision,
                      stage=args.stage, category=args.category, limit=args.limit)
    if args.command == "search-sources":
        return search_sources(root, args.query, limit=args.limit)
    if args.command == "info":
        return info(root)
    if args.command == "query":
        return query(root, args.query, kind=args.kind, category=args.category,
                     for_consumer=args.for_consumer, registered_only=args.registered_only,
                     consumer=args.consumer, decision=args.decision, stage=args.stage,
                     limit=args.limit, cursor=args.cursor)
    if args.command == "get-atom":
        return get_atom(root, args.atom_id, args.category, view=args.view,
                        consumer=args.consumer, decision=args.decision, stage=args.stage)
    if args.command == "get-source":
        return get_source(root, args.source_id, unit=args.unit, view=args.view)
    if args.command == "log-usage":
        try:
            record = json.load(sys.stdin) if args.input == "-" else json.loads(Path(args.input).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise LibraryError(f"cannot read usage JSON: {error}") from error
        if not isinstance(record, dict):
            raise LibraryError("usage input must be a JSON object")
        return log_usage(root, record)
    if args.command == "stats":
        return stats(root)
    if args.command == "validate":
        return validate(root)
    if args.command == "rebuild-index":
        return rebuild_index(root)
    if args.command == "recover":
        return recover(root)
    raise LibraryError(f"unknown command: {args.command}")


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = run(args)
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        if args.command == "validate" and not result["ok"]:
            return 1
        if (args.command == "put"
                and (result["index"]["status"] != "rebuilt"
                     or result.get("catalog", {}).get("status") != "rebuilt")):
            return 2  # canonical records committed; only the derived index failed
        return 0
    except (OSError, sqlite3.Error, LibraryError, TypeError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
