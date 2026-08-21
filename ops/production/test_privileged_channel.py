#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
INSTALLER = HERE / "install-production-privileged-channel.py"


class PrivilegedChannelTest(unittest.TestCase):
    @staticmethod
    def tree_digest(root: Path, prefixes: tuple[str, ...] | None = None) -> str:
        result = hashlib.sha256()
        excluded = {".asodef-release-manifest.json", ".source-sha"}
        candidates = root.rglob("*") if prefixes is None else (item for prefix in prefixes for item in (root / prefix).rglob("*"))
        for path in sorted(item for item in candidates if item.is_file() and item.name not in excluded):
            relative = path.relative_to(root).as_posix()
            file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            result.update(f"{relative}\0{file_hash}\n".encode("utf-8"))
        return result.hexdigest()

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.sha = "1" * 40
        self.api_id = "sha256:" + "a" * 64
        self.web_id = "sha256:" + "b" * 64
        self.previous_api_id = "sha256:" + "c" * 64
        self.previous_web_id = "sha256:" + "d" * 64
        self.source = self.root / "source-release"
        for subtree in ("ops/production", "ops/admin-core", "ops/mail-platform"):
            (self.source / subtree).mkdir(parents=True, exist_ok=True)
        production_files = (
            "provision-stack-env.py",
            "deploy-public-platform.sh",
            "install-compose-contract.sh",
            "compose-contract.sh",
            "rollback-compose-contract.sh",
            "docker-compose.release.yml.template",
            "install-production-privileged-channel.py",
        )
        for name in production_files:
            shutil.copy2(HERE / name, self.source / "ops/production" / name)
        for name in ("verify-runtime-env.sh", "docker-compose.admin-core.yml", "docker-compose.rollback.yml"):
            shutil.copy2(REPO / "ops/admin-core" / name, self.source / "ops/admin-core" / name)
        for name in (
            "verify-mail-network.sh",
            "verify.sh",
            "test-relay-security.sh",
            "authorized-negative-tests.py",
            "docker-compose.mail-platform.yml",
        ):
            shutil.copy2(REPO / "ops/mail-platform" / name, self.source / "ops/mail-platform" / name)
        (self.source / ".asodef-release-manifest.json").write_text(
            json.dumps(
                {
                    "sourceSha": self.sha,
                    "apiImage": f"asodef-public-platform-api:{self.sha}",
                    "apiImageId": self.api_id,
                    "webImage": f"asodef-public-platform-web:{self.sha}",
                    "webImageId": self.web_id,
                    "sourceTreeHash": self.tree_digest(self.source),
                    "privilegedOpsTreeHash": self.tree_digest(self.source, ("ops/production", "ops/admin-core", "ops/mail-platform")),
                    "privilegedInstallerSha256": hashlib.sha256(INSTALLER.read_bytes()).hexdigest(),
                }
            ),
            encoding="utf-8",
        )
        self.privileged = self.root / "privileged-releases"
        self.sudoers = self.root / "sudoers.d"
        self.privileged.mkdir()
        self.sudoers.mkdir()
        fake_bin = self.root / "bin"
        fake_bin.mkdir()
        docker = fake_bin / "docker"
        docker.write_text(
            "#!/usr/bin/env python3\n"
            "import os,sys\n"
            "tag=sys.argv[-1]; sha=os.environ['FAKE_SHA']\n"
            "target=tag.endswith(sha); is_api='-api:' in tag\n"
            "image=(os.environ['FAKE_API_ID'] if is_api else os.environ['FAKE_WEB_ID']) if target else (os.environ['FAKE_PREVIOUS_API_ID'] if is_api else os.environ['FAKE_PREVIOUS_WEB_ID'])\n"
            "print(image+'|'+sha if 'index .Config.Labels' in ' '.join(sys.argv) else image)\n",
            encoding="utf-8",
        )
        docker.chmod(0o755)
        visudo = fake_bin / "visudo"
        visudo.write_text(
            "#!/bin/sh\n"
            "test \"${FAKE_VISUDO_FAIL:-0}\" != 1 || exit 1\n"
            "exec /usr/sbin/visudo \"$@\"\n",
            encoding="utf-8",
        )
        visudo.chmod(0o755)
        self.environment = os.environ.copy()
        self.environment["PATH"] = f"{fake_bin}:{self.environment['PATH']}"
        self.environment["ASODEF_PRIVILEGED_INSTALL_TEST_MODE"] = "1"
        self.environment["FAKE_SHA"] = self.sha
        self.environment["FAKE_API_ID"] = self.api_id
        self.environment["FAKE_WEB_ID"] = self.web_id
        self.environment["FAKE_PREVIOUS_API_ID"] = self.previous_api_id
        self.environment["FAKE_PREVIOUS_WEB_ID"] = self.previous_web_id

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def command(self, apply: bool = True) -> list[str]:
        command = [
            str(INSTALLER),
            "--source-release", str(self.source),
            "--privileged-root", str(self.privileged),
            "--sudoers-dir", str(self.sudoers),
            "--source-sha", self.sha,
            "--operator-user", "asodefadmin",
            "--shared-dir", "/opt/asodef/public-platform/shared",
            "--mail-config", "/etc/asodef/mail-platform.env",
            "--target-api-image", f"asodef-public-platform-api:{self.sha}",
            "--target-web-image", f"asodef-public-platform-web:{self.sha}",
            "--previous-api-image", "asodef-public-platform-api:25a74a7ba72be769f63d991ec9cc6f67fd69665e",
            "--previous-api-image-id", self.previous_api_id,
            "--previous-web-image", "asodef-public-platform-web:93951e2",
            "--previous-web-image-id", self.previous_web_id,
        ]
        if apply:
            command.append("--apply")
        return command

    def test_installs_root_style_release_and_exact_digest_bound_sudoers(self) -> None:
        result = subprocess.run(self.command(), text=True, capture_output=True, env=self.environment, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        release = self.privileged / self.sha
        sudoers = (self.sudoers / "asodef-phase1-production-closure").read_text(encoding="utf-8")
        self.assertIn("Defaults!ASODEF_PHASE1_PRODUCTION_CLOSURE fdexec=never", sudoers)
        self.assertEqual(len(re.findall(r"sha256:[0-9a-f]{64} /", sudoers)), 9)
        self.assertIn("ops/mail-platform/verify.sh /etc/asodef/mail-platform.env", sudoers)
        self.assertIn("ops/mail-platform/test-relay-security.sh /etc/asodef/mail-platform.env", sudoers)
        self.assertNotIn("\n+", sudoers)
        self.assertIn(r"asodef-public-platform-api\:1111111111111111111111111111111111111111", sudoers)
        self.assertIn(r"--api-image-id sha256\:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", sudoers)
        self.assertNotIn("NOPASSWD: ALL", sudoers)
        for forbidden in ("/bin/bash", "/bin/sh ", "/usr/bin/docker ", "/usr/bin/systemctl ", "/usr/sbin/ufw "):
            self.assertNotIn(forbidden, sudoers)
        provisioner = release / "ops/production/provision-stack-env.py"
        original_digest = hashlib.sha256(provisioner.read_bytes()).hexdigest()
        self.assertIn(f"sha256:{original_digest} {provisioner}", sudoers)
        provisioner.chmod(0o755)
        provisioner.write_text(provisioner.read_text(encoding="utf-8") + "\n# modified\n", encoding="utf-8")
        self.assertNotEqual(hashlib.sha256(provisioner.read_bytes()).hexdigest(), original_digest)
        self.assertIn(f"sha256:{original_digest} {provisioner}", sudoers)
        repeated = subprocess.run(self.command(), text=True, capture_output=True, env=self.environment, check=False)
        self.assertNotEqual(repeated.returncode, 0)
        self.assertIn("EXISTING_PRIVILEGED_RELEASE_TREE_MISMATCH", repeated.stderr)

    def test_recovers_hardened_release_when_sudoers_install_previously_failed(self) -> None:
        failing_environment = self.environment.copy()
        failing_environment["FAKE_VISUDO_FAIL"] = "1"
        failed = subprocess.run(
            self.command(), text=True, capture_output=True, env=failing_environment, check=False
        )
        self.assertNotEqual(failed.returncode, 0)
        release = self.privileged / self.sha
        self.assertTrue(release.is_dir())
        self.assertEqual(stat.S_IMODE(release.stat().st_mode), 0o555)
        self.assertFalse((self.sudoers / "asodef-phase1-production-closure").exists())

        recovered = subprocess.run(
            self.command(), text=True, capture_output=True, env=self.environment, check=False
        )
        self.assertEqual(recovered.returncode, 0, recovered.stderr)
        sudoers = self.sudoers / "asodef-phase1-production-closure"
        self.assertTrue(sudoers.is_file())
        syntax = subprocess.run(
            ["/usr/sbin/visudo", "-cf", str(sudoers)], text=True, capture_output=True, check=False
        )
        self.assertEqual(syntax.returncode, 0, syntax.stderr)

    def test_dry_run_never_installs_release_or_sudoers(self) -> None:
        result = subprocess.run(self.command(apply=False), text=True, capture_output=True, env=self.environment, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.privileged / self.sha).exists())
        self.assertEqual(list(self.sudoers.iterdir()), [])

    def test_wrong_image_provenance_fails_before_install(self) -> None:
        environment = self.environment.copy()
        environment["FAKE_API_ID"] = "sha256:" + "c" * 64
        result = subprocess.run(self.command(), text=True, capture_output=True, env=environment, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.privileged / self.sha).exists())
        self.assertEqual(list(self.sudoers.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
