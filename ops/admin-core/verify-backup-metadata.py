#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path


class DuplicateKeyError(ValueError):
    pass


def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKeyError(key)
        result[key] = value
    return result


def fail(code: str) -> None:
    print(f"status=error code={code}", file=sys.stderr)
    raise SystemExit(1)


parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--metadata", required=True)
parser.add_argument("--fingerprint", required=True)
parser.add_argument("--encryption-fingerprint", required=True)
parser.add_argument("--sha256", required=True)
parser.add_argument("--size-bytes", required=True, type=int)
parser.add_argument("--database", required=True)
parser.add_argument("--release-sha", required=True)
args = parser.parse_args()

if not re.fullmatch(r"[0-9A-F]{40}", args.fingerprint):
    fail("BACKUP_EXPECTED_FINGERPRINT_INVALID")
if not re.fullmatch(r"[0-9A-F]{40}", args.encryption_fingerprint):
    fail("BACKUP_EXPECTED_ENCRYPTION_FINGERPRINT_INVALID")
if not re.fullmatch(r"[0-9a-f]{64}", args.sha256):
    fail("BACKUP_EXPECTED_CHECKSUM_INVALID")
if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]{0,62}", args.database):
    fail("BACKUP_EXPECTED_DATABASE_INVALID")
if not re.fullmatch(r"[0-9a-f]{40}", args.release_sha):
    fail("BACKUP_EXPECTED_RELEASE_INVALID")

try:
    metadata_path = Path(args.metadata)
    if metadata_path.stat().st_size > 16_384:
        fail("BACKUP_METADATA_SIZE_INVALID")
    raw = metadata_path.read_text(encoding="utf-8")
    document = json.loads(raw, object_pairs_hook=unique_object)
except DuplicateKeyError:
    fail("BACKUP_METADATA_DUPLICATE_KEY")
except (OSError, UnicodeError, json.JSONDecodeError):
    fail("BACKUP_METADATA_MALFORMED")

required_keys = {
    "timestamp",
    "sizeBytes",
    "sha256",
    "database",
    "releaseSha",
    "recipientFingerprint",
    "encryptionKeyFingerprint",
    "encrypted",
    "ciphertextStructure",
    "decryptability",
}
if not isinstance(document, dict) or set(document) != required_keys:
    fail("BACKUP_METADATA_SCHEMA_INVALID")
if not isinstance(document["timestamp"], str) or not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z", document["timestamp"]):
    fail("BACKUP_METADATA_TIMESTAMP_INVALID")
if type(document["sizeBytes"]) is not int or document["sizeBytes"] != args.size_bytes or args.size_bytes <= 0:
    fail("BACKUP_METADATA_SIZE_MISMATCH")
if document["sha256"] != args.sha256:
    fail("BACKUP_METADATA_CHECKSUM_MISMATCH")
if document["database"] != args.database:
    fail("BACKUP_METADATA_DATABASE_MISMATCH")
if document["releaseSha"] != args.release_sha:
    fail("BACKUP_METADATA_RELEASE_MISMATCH")
if document["recipientFingerprint"] != args.fingerprint:
    fail("BACKUP_RECIPIENT_METADATA_MISMATCH")
if document["encryptionKeyFingerprint"] != args.encryption_fingerprint:
    fail("BACKUP_ENCRYPTION_FINGERPRINT_MISMATCH")
if document["encrypted"] is not True:
    fail("BACKUP_METADATA_ENCRYPTION_STATE_INVALID")
if document["ciphertextStructure"] != "PASS":
    fail("BACKUP_METADATA_CIPHERTEXT_STATE_INVALID")
if document["decryptability"] != "PENDING_CUSTODY_VERIFICATION":
    fail("BACKUP_CUSTODY_STATE_INVALID")

print(
    "status=ok metadata=PASS fingerprint=PASS checksum=PASS size=PASS "
    "database=PASS release=PASS encrypted=true ciphertextStructure=PASS"
)
