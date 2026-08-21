#!/usr/bin/env python3
"""Create a deterministic GitHub release-source artifact for an exact main SHA."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile


SHA = re.compile(r"^[0-9a-f]{40}$")
PRIVATE_KEY_MARKERS = (
    b"-----BEGIN PRIVATE KEY-----",
    b"-----BEGIN RSA PRIVATE KEY-----",
    b"-----BEGIN EC PRIVATE KEY-----",
    b"-----BEGIN DSA PRIVATE KEY-----",
    b"-----BEGIN OPENSSH PRIVATE KEY-----",
)


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def validate_archive(path: Path) -> None:
    seen: set[str] = set()
    with tarfile.open(path, "r:gz") as archive:
        members = archive.getmembers()
        if len(members) > 100_000 or sum(member.size for member in members) > 256 * 1024 * 1024:
            raise SystemExit("release artifact limits exceeded")
        for member in members:
            name = member.name
            parts = Path(name).parts
            if not parts or parts[0] != "source" or name.startswith("/") or ".." in parts or name in seen:
                raise SystemExit("unsafe or duplicate source archive path")
            if not (member.isfile() or member.isdir()):
                raise SystemExit("links and special files are forbidden in release artifacts")
            if member.isfile() and member.size > 64 * 1024 * 1024:
                raise SystemExit("release artifact file limit exceeded")
            if member.isfile() and Path(name).name in {".env", ".env.production", ".stack.env"}:
                raise SystemExit("runtime environment file is forbidden in release artifacts")
            if member.isfile():
                stream = archive.extractfile(member)
                if stream is None:
                    raise SystemExit("release artifact member is unreadable")
                content = stream.read()
                if any(marker in content for marker in PRIVATE_KEY_MARKERS):
                    raise SystemExit("private-key marker found in release artifact")
            seen.add(name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository-root", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--workflow-run-id", required=True)
    parser.add_argument("--repository", default="DevOps-Solutions-IA/Asodef")
    args = parser.parse_args()
    if not SHA.fullmatch(args.source_sha) or not re.fullmatch(r"[1-9][0-9]*", args.workflow_run_id):
        raise SystemExit("invalid release identity")

    repository_root = Path(args.repository_root).resolve()
    output = Path(args.output_dir).resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit("output directory must be empty")
    output.mkdir(parents=True, exist_ok=True)
    head = subprocess.check_output(["git", "-C", repository_root, "rev-parse", "HEAD"], text=True).strip()
    if head != args.source_sha:
        raise SystemExit("source SHA does not match checkout HEAD")
    subprocess.run(["git", "-C", repository_root, "cat-file", "-e", f"{args.source_sha}^{{commit}}"], check=True)

    archive_path = output / "source.tar.gz"
    with tempfile.NamedTemporaryFile(dir=output, prefix="source.", suffix=".tar", delete=False) as raw:
        raw_path = Path(raw.name)
    try:
        with raw_path.open("wb") as stream:
            subprocess.run(
                ["git", "-C", repository_root, "archive", "--format=tar", "--prefix=source/", args.source_sha],
                check=True,
                stdout=stream,
            )
        with raw_path.open("rb") as source, archive_path.open("wb") as target:
            with gzip.GzipFile(filename="", mode="wb", fileobj=target, mtime=0) as compressed:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    compressed.write(block)
    finally:
        raw_path.unlink(missing_ok=True)
    validate_archive(archive_path)

    installer_path = repository_root / "ops/production/install-published-release.py"
    if not installer_path.is_file() or installer_path.is_symlink():
        raise SystemExit("release installer is unavailable")
    installer_hash = digest(installer_path)
    with tarfile.open(archive_path, "r:gz") as archive:
        archived_installer = archive.extractfile("source/ops/production/install-published-release.py")
        if archived_installer is None or hashlib.sha256(archived_installer.read()).hexdigest() != installer_hash:
            raise SystemExit("checkout installer differs from committed source archive")
    manifest = {
        "schemaVersion": 1,
        "repository": args.repository,
        "sourceSha": args.source_sha,
        "workflowRunId": args.workflow_run_id,
        "workflowName": "CI",
        "sourceArchive": {
            "file": archive_path.name,
            "sha256": digest(archive_path),
            "sizeBytes": archive_path.stat().st_size,
        },
        "installer": {
            "path": "source/ops/production/install-published-release.py",
            "sha256": installer_hash,
        },
    }
    manifest_path = output / "release-source-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    checksums = output / "checksums.sha256"
    checksums.write_text(f'{digest(archive_path)}  {archive_path.name}\n{digest(manifest_path)}  {manifest_path.name}\n', encoding="ascii")
    print(f"status=ok sourceSha={args.source_sha} runId={args.workflow_run_id} artifactHash={manifest['sourceArchive']['sha256']} secrets=NONE")


if __name__ == "__main__":
    main()
