#!/usr/bin/env python3
"""Verify a CI source artifact, build exact images, and atomically install it."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile


SHA = re.compile(r"^[0-9a-f]{40}$")
IMAGE_ID = re.compile(r"^sha256:[0-9a-f]{64}$")


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def tree_digest(root: Path, prefixes: tuple[str, ...] | None = None) -> str:
    result = hashlib.sha256()
    excluded = {".asodef-release-manifest.json", ".source-sha"}
    candidates = root.rglob("*") if prefixes is None else (item for prefix in prefixes for item in (root / prefix).rglob("*"))
    paths = []
    for path in candidates:
        if path.is_symlink():
            raise SystemExit("status=error code=RELEASE_SYMLINK_UNSAFE")
        if path.is_file() and path.name not in excluded:
            paths.append(path)
    for path in sorted(paths):
        relative = path.relative_to(root).as_posix()
        result.update(f"{relative}\0{digest(path)}\n".encode("utf-8"))
    return result.hexdigest()


def load_manifest(artifact_dir: Path, source_sha: str) -> dict[str, object]:
    manifest_path = artifact_dir / "release-source-manifest.json"
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise SystemExit("status=error code=MANIFEST_UNAVAILABLE")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise SystemExit("status=error code=MANIFEST_INVALID")
    expected = {"schemaVersion", "repository", "sourceSha", "workflowRunId", "workflowName", "sourceArchive", "installer"}
    if set(manifest) != expected or manifest["schemaVersion"] != 1 or manifest["repository"] != "DevOps-Solutions-IA/Asodef":
        raise SystemExit("status=error code=MANIFEST_CONTRACT_INVALID")
    if manifest["sourceSha"] != source_sha or manifest["workflowName"] != "CI" or not str(manifest["workflowRunId"]).isdigit():
        raise SystemExit("status=error code=MANIFEST_PROVENANCE_INVALID")
    archive = manifest.get("sourceArchive")
    installer = manifest.get("installer")
    if not isinstance(archive, dict) or set(archive) != {"file", "sha256", "sizeBytes"}:
        raise SystemExit("status=error code=MANIFEST_ARCHIVE_INVALID")
    if not isinstance(installer, dict) or set(installer) != {"path", "sha256"}:
        raise SystemExit("status=error code=MANIFEST_INSTALLER_INVALID")
    if archive["file"] != "source.tar.gz" or not re.fullmatch(r"[0-9a-f]{64}", str(archive["sha256"])) or not isinstance(archive["sizeBytes"], int):
        raise SystemExit("status=error code=MANIFEST_ARCHIVE_INVALID")
    if installer["path"] != "source/ops/production/install-published-release.py" or not re.fullmatch(r"[0-9a-f]{64}", str(installer["sha256"])):
        raise SystemExit("status=error code=MANIFEST_INSTALLER_INVALID")
    return manifest


def validate_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = archive.getmembers()
    if len(members) > 100_000 or sum(member.size for member in members) > 256 * 1024 * 1024:
        raise SystemExit("status=error code=ARCHIVE_LIMIT_EXCEEDED")
    seen: set[str] = set()
    for member in members:
        parts = Path(member.name).parts
        if not parts or parts[0] != "source" or member.name.startswith("/") or ".." in parts or member.name in seen:
            raise SystemExit("status=error code=ARCHIVE_PATH_UNSAFE")
        if not (member.isfile() or member.isdir()):
            raise SystemExit("status=error code=ARCHIVE_TYPE_UNSAFE")
        if member.isfile() and member.size > 64 * 1024 * 1024:
            raise SystemExit("status=error code=ARCHIVE_FILE_LIMIT_EXCEEDED")
        if member.mode & 0o7000:
            raise SystemExit("status=error code=ARCHIVE_MODE_UNSAFE")
        seen.add(member.name)
    return members


def inspect_image(tag: str, source_sha: str) -> str:
    output = subprocess.check_output(
        ["docker", "image", "inspect", "--format", '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}', tag],
        text=True,
    ).strip()
    image_id, separator, revision = output.partition("|")
    if not separator or not IMAGE_ID.fullmatch(image_id) or revision != source_sha:
        raise SystemExit("status=error code=IMAGE_PROVENANCE_INVALID")
    return image_id


def make_read_only(root: Path) -> None:
    for path in sorted(root.rglob("*"), reverse=True):
        if path.is_symlink():
            raise SystemExit("status=error code=RELEASE_SYMLINK_UNSAFE")
        if path.is_dir():
            path.chmod(0o555)
        elif path.is_file():
            executable = bool(path.stat().st_mode & stat.S_IXUSR)
            path.chmod(0o555 if executable else 0o444)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--release-root", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not SHA.fullmatch(args.source_sha):
        raise SystemExit("status=error code=SOURCE_SHA_INVALID")
    artifact_input = Path(args.artifact_dir)
    release_input = Path(args.release_root)
    if artifact_input.is_symlink() or release_input.is_symlink():
        raise SystemExit("status=error code=INPUT_PATH_SYMLINK_UNSAFE")
    artifact_dir = artifact_input.resolve()
    release_root = release_input.resolve()
    if not artifact_dir.is_dir():
        raise SystemExit("status=error code=ARTIFACT_DIRECTORY_UNSAFE")
    if not release_root.is_dir():
        raise SystemExit("status=error code=RELEASE_ROOT_UNSAFE")
    manifest = load_manifest(artifact_dir, args.source_sha)
    archive_path = artifact_dir / str(manifest["sourceArchive"]["file"])
    if not archive_path.is_file() or archive_path.is_symlink():
        raise SystemExit("status=error code=SOURCE_ARCHIVE_UNAVAILABLE")
    if archive_path.stat().st_size != manifest["sourceArchive"]["sizeBytes"] or digest(archive_path) != manifest["sourceArchive"]["sha256"]:
        raise SystemExit("status=error code=SOURCE_ARCHIVE_HASH_MISMATCH")
    with tarfile.open(archive_path, "r:gz") as archive:
        members = validate_members(archive)
        installer_member = archive.getmember(str(manifest["installer"]["path"]))
        installer_stream = archive.extractfile(installer_member)
        if installer_stream is None or hashlib.sha256(installer_stream.read()).hexdigest() != manifest["installer"]["sha256"]:
            raise SystemExit("status=error code=INSTALLER_HASH_MISMATCH")
    destination = release_root / args.source_sha
    api_tag = f"asodef-public-platform-api:{args.source_sha}"
    web_tag = f"asodef-public-platform-web:{args.source_sha}"
    if destination.exists():
        installed_manifest = destination / ".asodef-release-manifest.json"
        if not destination.is_dir() or destination.is_symlink() or not installed_manifest.is_file():
            raise SystemExit("status=error code=EXISTING_RELEASE_UNSAFE")
        installed = json.loads(installed_manifest.read_text(encoding="utf-8"))
        if installed.get("sourceSha") != args.source_sha:
            raise SystemExit("status=error code=EXISTING_RELEASE_MISMATCH")
        if installed.get("sourceTreeHash") != tree_digest(destination):
            raise SystemExit("status=error code=EXISTING_RELEASE_TREE_MISMATCH")
        api_id = inspect_image(api_tag, args.source_sha)
        web_id = inspect_image(web_tag, args.source_sha)
        if installed.get("apiImageId") != api_id or installed.get("webImageId") != web_id:
            raise SystemExit("status=error code=EXISTING_IMAGE_MISMATCH")
        print(f"status=ok action=publish changed=NO sourceSha={args.source_sha} apiImageId={api_id} webImageId={web_id}")
        return
    if not args.apply:
        print(f"status=ready action=publish apply=false sourceSha={args.source_sha} artifactHash={manifest['sourceArchive']['sha256']}")
        return

    stage = Path(tempfile.mkdtemp(prefix=f".{args.source_sha}.stage.", dir=release_root))
    try:
        with tarfile.open(archive_path, "r:gz") as archive:
            members = validate_members(archive)
            archive.extractall(stage, members=members, filter="data")
        source = stage / "source"
        subprocess.run(
            ["docker", "build", "--quiet", "--file", "apps/api/Dockerfile", "--label", f"org.opencontainers.image.revision={args.source_sha}", "--tag", api_tag, "."],
            cwd=source,
            check=True,
        )
        subprocess.run(
            ["docker", "build", "--quiet", "--file", "apps/web/Dockerfile", "--build-arg", "VITE_API_URL=", "--build-arg", "VITE_APP_URL=https://asodef.com.co", "--label", f"org.opencontainers.image.revision={args.source_sha}", "--tag", web_tag, "."],
            cwd=source,
            check=True,
        )
        api_id = inspect_image(api_tag, args.source_sha)
        web_id = inspect_image(web_tag, args.source_sha)
        privileged_installer = source / "ops/production/install-production-privileged-channel.py"
        ai_runtime_provisioner = source / "ops/production/provision-ai-runtime.py"
        if not privileged_installer.is_file() or privileged_installer.is_symlink():
            raise SystemExit("status=error code=PRIVILEGED_INSTALLER_UNAVAILABLE")
        if not ai_runtime_provisioner.is_file() or ai_runtime_provisioner.is_symlink() or not os.access(ai_runtime_provisioner, os.X_OK):
            raise SystemExit("status=error code=AI_RUNTIME_PROVISIONER_UNAVAILABLE")
        installed = {
            **manifest,
            "apiImage": api_tag,
            "apiImageId": api_id,
            "webImage": web_tag,
            "webImageId": web_id,
            "sourceTreeHash": tree_digest(source),
            "privilegedOpsTreeHash": tree_digest(source, ("ops/production", "ops/admin-core", "ops/mail-platform")),
            "privilegedInstallerSha256": digest(privileged_installer),
            "aiRuntimeProvisionerSha256": digest(ai_runtime_provisioner),
        }
        (source / ".asodef-release-manifest.json").write_text(json.dumps(installed, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (source / ".source-sha").write_text(args.source_sha + "\n", encoding="ascii")
        make_read_only(source)
        os.replace(source, destination)
        destination.chmod(0o555)
        descriptor = os.open(release_root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        print(f"status=ok action=publish changed=YES sourceSha={args.source_sha} apiImageId={api_id} webImageId={web_id} releaseDir={destination}")
    finally:
        shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    main()
