#!/usr/bin/env python3
"""Install a release-specific, digest-bound production sudo channel."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import stat
import subprocess
import tempfile


SHA = re.compile(r"^[0-9a-f]{40}$")
IMAGE_ID = re.compile(r"^sha256:[0-9a-f]{64}$")
CANONICAL_PRIVILEGED_ROOT = Path("/usr/local/libexec/asodef/privileged-releases")
CANONICAL_SUDOERS_DIR = Path("/etc/sudoers.d")
CANONICAL_OPERATOR_USER = "asodefadmin"
CANONICAL_SHARED_DIR = Path("/opt/asodef/public-platform/shared")
CANONICAL_MAIL_CONFIG = Path("/etc/asodef/mail-platform.env")


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
            raise SystemExit("status=error code=SOURCE_SYMLINK_UNSAFE")
        if path.is_file() and path.name not in excluded:
            paths.append(path)
    for path in sorted(paths):
        relative = path.relative_to(root).as_posix()
        result.update(f"{relative}\0{digest(path)}\n".encode("utf-8"))
    return result.hexdigest()


def inspect_image(tag: str, expected_id: str, source_sha: str) -> None:
    output = subprocess.check_output(
        ["docker", "image", "inspect", "--format", '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}', tag],
        text=True,
    ).strip()
    image_id, separator, revision = output.partition("|")
    if not separator or image_id != expected_id or revision != source_sha:
        raise SystemExit("status=error code=IMAGE_PROVENANCE_INVALID")


def inspect_image_id(tag: str, expected_id: str) -> None:
    output = subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{.Id}}", tag],
        text=True,
    ).strip()
    if output != expected_id:
        raise SystemExit("status=error code=PREVIOUS_IMAGE_PROVENANCE_INVALID")


def harden(root: Path) -> None:
    for path in sorted(root.rglob("*"), reverse=True):
        if path.is_symlink():
            raise SystemExit("status=error code=SOURCE_SYMLINK_UNSAFE")
        if path.is_dir():
            path.chmod(0o555)
        elif path.is_file():
            path.chmod(0o555 if path.stat().st_mode & stat.S_IXUSR else 0o444)


def validate_hardened(root: Path, expected_hash: str, *, test_mode: bool) -> None:
    if tree_digest(root) != expected_hash:
        raise SystemExit("status=error code=EXISTING_PRIVILEGED_RELEASE_TREE_MISMATCH")
    for path in (root, *root.rglob("*")):
        details = path.lstat()
        if path.is_symlink() or details.st_mode & 0o022:
            raise SystemExit("status=error code=EXISTING_PRIVILEGED_RELEASE_PERMISSIONS_UNSAFE")
        if not test_mode and details.st_uid != 0:
            raise SystemExit("status=error code=EXISTING_PRIVILEGED_RELEASE_OWNER_INVALID")


def validate_privileged_ancestor_chain(path: Path, *, test_mode: bool) -> None:
    stop = Path(os.environ["ASODEF_PRIVILEGED_TEST_TRUST_ROOT"]).absolute() if test_mode else Path("/")
    current = path.absolute()
    try:
        relative = current.relative_to(stop)
    except ValueError:
        raise SystemExit("status=error code=PRIVILEGED_ROOT_ANCESTOR_INVALID")
    candidates = [stop]
    for component in relative.parts:
        candidates.append(candidates[-1] / component)
    for candidate in candidates:
        details = candidate.lstat()
        if stat.S_ISLNK(details.st_mode) or not stat.S_ISDIR(details.st_mode) or details.st_mode & 0o022:
            raise SystemExit("status=error code=PRIVILEGED_ROOT_ANCESTOR_UNSAFE")
        if not test_mode and details.st_uid != 0:
            raise SystemExit("status=error code=PRIVILEGED_ROOT_ANCESTOR_OWNER_INVALID")


def command(digest_value: str, executable: Path, arguments: str) -> str:
    escaped_arguments = "".join(f"\\{character}" if character in "\\,:=" else character for character in arguments)
    return f"sha256:{digest_value} {executable} {escaped_arguments}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-release", required=True)
    parser.add_argument("--privileged-root", default="/usr/local/libexec/asodef/privileged-releases")
    parser.add_argument("--sudoers-dir", default="/etc/sudoers.d")
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--operator-user", default="asodefadmin")
    parser.add_argument("--shared-dir", default="/opt/asodef/public-platform/shared")
    parser.add_argument("--mail-config", default="/etc/asodef/mail-platform.env")
    parser.add_argument("--target-api-image", required=True)
    parser.add_argument("--target-web-image", required=True)
    parser.add_argument("--previous-api-image", required=True)
    parser.add_argument("--previous-api-image-id", required=True)
    parser.add_argument("--previous-web-image", required=True)
    parser.add_argument("--previous-web-image-id", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    test_mode = os.environ.get("ASODEF_PRIVILEGED_INSTALL_TEST_MODE") == "1"
    if not test_mode:
        canonical_parameters = (
            (Path(args.privileged_root) == CANONICAL_PRIVILEGED_ROOT, "PRIVILEGED_ROOT_NONCANONICAL"),
            (Path(args.sudoers_dir) == CANONICAL_SUDOERS_DIR, "SUDOERS_DIRECTORY_NONCANONICAL"),
            (args.operator_user == CANONICAL_OPERATOR_USER, "OPERATOR_USER_NONCANONICAL"),
            (Path(args.shared_dir) == CANONICAL_SHARED_DIR, "SHARED_DIRECTORY_NONCANONICAL"),
            (Path(args.mail_config) == CANONICAL_MAIL_CONFIG, "MAIL_CONFIG_NONCANONICAL"),
        )
        for valid, code in canonical_parameters:
            if not valid:
                raise SystemExit(f"status=error code={code}")
    if os.geteuid() != 0 and not test_mode:
        raise SystemExit("status=error code=ROOT_REQUIRED")
    if not SHA.fullmatch(args.source_sha):
        raise SystemExit("status=error code=SOURCE_SHA_INVALID")
    if args.target_api_image != f"asodef-public-platform-api:{args.source_sha}" or args.target_web_image != f"asodef-public-platform-web:{args.source_sha}":
        raise SystemExit("status=error code=TARGET_IMAGE_TAG_INVALID")
    if not re.fullmatch(r"asodef-public-platform-api:[0-9a-f]{7,40}", args.previous_api_image) or not re.fullmatch(r"asodef-public-platform-web:[0-9a-f]{7,40}", args.previous_web_image):
        raise SystemExit("status=error code=PREVIOUS_IMAGE_TAG_INVALID")
    if not IMAGE_ID.fullmatch(args.previous_api_image_id) or not IMAGE_ID.fullmatch(args.previous_web_image_id):
        raise SystemExit("status=error code=PREVIOUS_IMAGE_ID_INVALID")
    try:
        pwd.getpwnam(args.operator_user)
    except KeyError:
        if not test_mode:
            raise SystemExit("status=error code=OPERATOR_USER_INVALID")

    source_input = Path(args.source_release)
    privileged_input = Path(args.privileged_root)
    sudoers_input = Path(args.sudoers_dir)
    if source_input.is_symlink() or privileged_input.is_symlink() or sudoers_input.is_symlink():
        raise SystemExit("status=error code=INPUT_PATH_SYMLINK_UNSAFE")
    source = source_input.resolve()
    manifest_path = source / ".asodef-release-manifest.json"
    if not source.is_dir() or source.is_symlink() or not manifest_path.is_file() or manifest_path.is_symlink():
        raise SystemExit("status=error code=SOURCE_RELEASE_UNSAFE")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("sourceSha") != args.source_sha or manifest.get("apiImage") != args.target_api_image or manifest.get("webImage") != args.target_web_image:
        raise SystemExit("status=error code=SOURCE_RELEASE_PROVENANCE_INVALID")
    api_id = manifest.get("apiImageId")
    web_id = manifest.get("webImageId")
    if not isinstance(api_id, str) or not isinstance(web_id, str) or not IMAGE_ID.fullmatch(api_id) or not IMAGE_ID.fullmatch(web_id):
        raise SystemExit("status=error code=SOURCE_RELEASE_IMAGE_ID_INVALID")
    own_path = Path(__file__)
    own_details = own_path.lstat()
    if own_path.is_symlink() or not stat.S_ISREG(own_details.st_mode):
        raise SystemExit("status=error code=BOOTSTRAP_COPY_UNSAFE")
    if not test_mode and (own_details.st_uid != 0 or stat.S_IMODE(own_details.st_mode) != 0o700):
        raise SystemExit("status=error code=BOOTSTRAP_COPY_PERMISSIONS_UNSAFE")
    if manifest.get("privilegedInstallerSha256") != digest(own_path):
        raise SystemExit("status=error code=BOOTSTRAP_COPY_HASH_MISMATCH")
    expected_tree_hash = manifest.get("sourceTreeHash")
    if not isinstance(expected_tree_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_tree_hash) or tree_digest(source) != expected_tree_hash:
        raise SystemExit("status=error code=SOURCE_RELEASE_TREE_MISMATCH")
    expected_ops_hash = manifest.get("privilegedOpsTreeHash")
    ops_prefixes = ("ops/production", "ops/admin-core", "ops/mail-platform")
    if not isinstance(expected_ops_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_ops_hash) or tree_digest(source, ops_prefixes) != expected_ops_hash:
        raise SystemExit("status=error code=SOURCE_PRIVILEGED_OPS_MISMATCH")
    ai_runtime_provisioner = source / "ops/production/provision-ai-runtime.py"
    if (
        not ai_runtime_provisioner.is_file()
        or ai_runtime_provisioner.is_symlink()
        or not os.access(ai_runtime_provisioner, os.X_OK)
        or manifest.get("aiRuntimeProvisionerSha256") != digest(ai_runtime_provisioner)
    ):
        raise SystemExit("status=error code=AI_RUNTIME_PROVISIONER_PROVENANCE_INVALID")
    inspect_image(args.target_api_image, api_id, args.source_sha)
    inspect_image(args.target_web_image, web_id, args.source_sha)
    inspect_image_id(args.previous_api_image, args.previous_api_image_id)
    inspect_image_id(args.previous_web_image, args.previous_web_image_id)

    validate_privileged_ancestor_chain(privileged_input, test_mode=test_mode)
    privileged_root = privileged_input.resolve()
    sudoers_dir = sudoers_input.resolve()
    for directory, code, mode in ((privileged_root, "PRIVILEGED_ROOT", 0o755), (sudoers_dir, "SUDOERS_DIRECTORY", 0o755)):
        if not directory.is_dir() or directory.is_symlink():
            raise SystemExit(f"status=error code={code}_UNSAFE")
        if not test_mode and (directory.stat().st_uid != 0 or stat.S_IMODE(directory.stat().st_mode) & 0o022):
            raise SystemExit(f"status=error code={code}_PERMISSIONS_UNSAFE")

    destination = privileged_root / args.source_sha
    if destination.exists():
        installed_marker = destination / ".source-sha"
        if not destination.is_dir() or destination.is_symlink() or not installed_marker.is_file() or installed_marker.is_symlink() or installed_marker.read_text(encoding="ascii").strip() != args.source_sha:
            raise SystemExit("status=error code=EXISTING_PRIVILEGED_RELEASE_MISMATCH")
        validate_hardened(destination, expected_ops_hash, test_mode=test_mode)
    elif args.apply:
        stage = Path(tempfile.mkdtemp(prefix=f".{args.source_sha}.privileged.", dir=privileged_root))
        try:
            for subtree in ("ops/production", "ops/admin-core", "ops/mail-platform"):
                source_tree = source / subtree
                if not source_tree.is_dir() or source_tree.is_symlink():
                    raise SystemExit("status=error code=PRIVILEGED_SOURCE_TREE_UNAVAILABLE")
                shutil.copytree(source_tree, stage / subtree, symlinks=False)
            (stage / ".source-sha").write_text(args.source_sha + "\n", encoding="ascii")
            if tree_digest(stage) != expected_ops_hash:
                raise SystemExit("status=error code=PRIVILEGED_COPY_HASH_MISMATCH")
            harden(stage)
            os.replace(stage, destination)
            destination.chmod(0o555)
        finally:
            if stage.exists():
                shutil.rmtree(stage, ignore_errors=True)

    if args.apply:
        validate_hardened(destination, expected_ops_hash, test_mode=test_mode)

    release = destination
    executables = {
        "provision": release / "ops/production/provision-stack-env.py",
        "verify_env": release / "ops/admin-core/verify-runtime-env.sh",
        "deploy": release / "ops/production/deploy-public-platform.sh",
        "rollback_compose": release / "ops/production/rollback-compose-contract.sh",
        "ai_runtime": release / "ops/production/provision-ai-runtime.py",
        "verify_network": release / "ops/mail-platform/verify-mail-network.sh",
        "verify_mail": release / "ops/mail-platform/verify.sh",
        "test_relay": release / "ops/mail-platform/test-relay-security.sh",
    }
    if args.apply:
        for executable in executables.values():
            if not executable.is_file() or executable.is_symlink() or not os.access(executable, os.X_OK):
                raise SystemExit("status=error code=PRIVILEGED_ENTRYPOINT_UNAVAILABLE")
    elif not destination.exists():
        print(f"status=ready action=install-privileged-channel apply=false sourceSha={args.source_sha}")
        return

    shared = args.shared_dir
    stack = f"{shared}/.stack.env"
    app_env = f"{shared}/.env.production"
    deploy_arguments = f"--shared-dir {shared} --source-sha {args.source_sha} --api-image {args.target_api_image} --api-image-id {api_id} --web-image {args.target_web_image} --web-image-id {web_id}"
    commands = [
        command(digest(executables["provision"]), executables["provision"], f"provision --stack-env {stack} --app-env {app_env} --mail-config {args.mail_config} --expected-mfa false"),
        command(digest(executables["provision"]), executables["provision"], f"rollback --stack-env {stack}"),
        command(digest(executables["verify_env"]), executables["verify_env"], f"--env-file {stack} --expected-mfa false"),
        command(digest(executables["deploy"]), executables["deploy"], deploy_arguments),
        command(digest(executables["deploy"]), executables["deploy"], f"{deploy_arguments} --apply"),
        command(digest(executables["rollback_compose"]), executables["rollback_compose"], f"--shared-dir {shared} --api-image {args.previous_api_image} --api-image-id {args.previous_api_image_id} --web-image {args.previous_web_image} --web-image-id {args.previous_web_image_id} --apply"),
        command(digest(executables["verify_network"]), executables["verify_network"], f"{args.mail_config} --attachment-only"),
        command(digest(executables["verify_network"]), executables["verify_network"], args.mail_config),
        command(digest(executables["verify_mail"]), executables["verify_mail"], args.mail_config),
        command(digest(executables["test_relay"]), executables["test_relay"], args.mail_config),
    ]
    alias = "ASODEF_PHASE1_PRODUCTION_CLOSURE"
    continuation = ", \\\n    "
    sudoers = (
        f"Cmnd_Alias {alias} = {continuation.join(commands)}\n"
        f"Defaults!{alias} fdexec=never\n"
        f"{args.operator_user} ALL=(root) NOPASSWD: {alias}\n"
    )
    if any(token in sudoers for token in ("NOPASSWD: ALL", "/bin/bash", "/bin/sh ", " /usr/bin/docker ", " /usr/bin/systemctl ", " /usr/sbin/ufw ")):
        raise SystemExit("status=error code=SUDOERS_SCOPE_UNSAFE")
    if not args.apply:
        print(f"status=ready action=install-privileged-channel apply=false sourceSha={args.source_sha} commands={len(commands)}")
        return

    sudoers_target = sudoers_dir / "asodef-phase1-production-closure"
    descriptor, temporary_name = tempfile.mkstemp(prefix=".asodef-sudoers.", dir=sudoers_dir)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o440)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(sudoers)
            stream.flush()
            os.fsync(stream.fileno())
        subprocess.run(["visudo", "-cf", temporary], check=True, stdout=subprocess.DEVNULL)
        os.replace(temporary, sudoers_target)
        sudoers_target.chmod(0o440)
        directory_descriptor = os.open(sudoers_dir, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"status=ok action=install-privileged-channel sourceSha={args.source_sha} commands={len(commands)} sudoers=VALID secrets=NONE")


if __name__ == "__main__":
    main()
