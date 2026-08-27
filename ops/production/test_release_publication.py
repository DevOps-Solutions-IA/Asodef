#!/usr/bin/env python3

from __future__ import annotations

import json
import hashlib
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
CREATE = HERE / "create-release-source-artifact.py"
INSTALL = HERE / "install-published-release.py"
PUBLISH = HERE / "publish-release.sh"


class ReleasePublicationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.repository = self.root / "repository"
        (self.repository / "ops/production").mkdir(parents=True)
        shutil.copy2(INSTALL, self.repository / "ops/production/install-published-release.py")
        shutil.copy2(HERE / "install-production-privileged-channel.py", self.repository / "ops/production/install-production-privileged-channel.py")
        shutil.copy2(HERE / "provision-ai-runtime.py", self.repository / "ops/production/provision-ai-runtime.py")
        (self.repository / "README.md").write_text("synthetic release fixture\n", encoding="utf-8")
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=self.repository, check=True)
        subprocess.run(["git", "config", "user.email", "ci@example.invalid"], cwd=self.repository, check=True)
        subprocess.run(["git", "config", "user.name", "ASODEF CI"], cwd=self.repository, check=True)
        subprocess.run(["git", "add", "--", "README.md", "ops/production/install-published-release.py", "ops/production/install-production-privileged-channel.py", "ops/production/provision-ai-runtime.py"], cwd=self.repository, check=True)
        subprocess.run(["git", "commit", "-qm", "fixture"], cwd=self.repository, check=True)
        self.sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.repository, text=True).strip()
        self.run_id = "123456789"
        self.artifact = self.root / "artifact"
        created = subprocess.run(
            [str(CREATE), "--repository-root", str(self.repository), "--output-dir", str(self.artifact), "--source-sha", self.sha, "--workflow-run-id", self.run_id],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(created.returncode, 0, created.stderr)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def fake_docker(self, *, fail_web: bool = False) -> tuple[Path, dict[str, str]]:
        binary = self.root / ("fake-bin-fail" if fail_web else "fake-bin")
        binary.mkdir(exist_ok=True)
        state = self.root / ("docker-state-fail" if fail_web else "docker-state")
        state.mkdir(exist_ok=True)
        script = binary / "docker"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "import hashlib,os,pathlib,sys\n"
            "args=sys.argv[1:]; state=pathlib.Path(os.environ['FAKE_DOCKER_STATE'])\n"
            "if args[0]=='build':\n"
            " tag=args[args.index('--tag')+1]; label=args[args.index('--label')+1].split('=',1)[1]\n"
            " if os.environ.get('FAKE_DOCKER_FAIL_WEB')=='1' and '-web:' in tag: sys.exit(9)\n"
            " image='sha256:'+hashlib.sha256(tag.encode()).hexdigest(); (state/hashlib.sha256(tag.encode()).hexdigest()).write_text(image+'|'+label)\n"
            " print(image); sys.exit(0)\n"
            "if args[:2]==['image','inspect']:\n"
            " tag=args[-1]; print((state/hashlib.sha256(tag.encode()).hexdigest()).read_text()); sys.exit(0)\n"
            "sys.exit(8)\n",
            encoding="utf-8",
        )
        script.chmod(0o755)
        environment = os.environ.copy()
        environment["PATH"] = f"{binary}:{environment['PATH']}"
        environment["FAKE_DOCKER_STATE"] = str(state)
        if fail_web:
            environment["FAKE_DOCKER_FAIL_WEB"] = "1"
        return binary, environment

    def test_artifact_dry_run_and_hash_tamper_detection(self) -> None:
        releases = self.root / "releases-dry"
        releases.mkdir()
        ready = subprocess.run(
            [str(INSTALL), "--artifact-dir", str(self.artifact), "--release-root", str(releases), "--source-sha", self.sha],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(ready.returncode, 0, ready.stderr)
        self.assertIn("artifactHash=", ready.stdout)
        with (self.artifact / "source.tar.gz").open("ab") as stream:
            stream.write(b"tamper")
        failed = subprocess.run(
            [str(INSTALL), "--artifact-dir", str(self.artifact), "--release-root", str(releases), "--source-sha", self.sha],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn("SOURCE_ARCHIVE_HASH_MISMATCH", failed.stderr)

    def test_artifact_rejects_private_key_markers(self) -> None:
        marker = "-----BEGIN " + "PRIVATE KEY-----"
        (self.repository / "credential.txt").write_text(
            marker + "\nsynthetic-only\n-----END " + "PRIVATE KEY-----\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "add", "--", "credential.txt"], cwd=self.repository, check=True)
        subprocess.run(["git", "commit", "-qm", "hostile fixture"], cwd=self.repository, check=True)
        hostile_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.repository, text=True).strip()
        result = subprocess.run(
            [str(CREATE), "--repository-root", str(self.repository), "--output-dir", str(self.root / "hostile-artifact"), "--source-sha", hostile_sha, "--workflow-run-id", self.run_id],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("private-key marker", result.stderr)

    def test_install_is_atomic_immutable_and_idempotent(self) -> None:
        releases = self.root / "releases"
        releases.mkdir()
        _, environment = self.fake_docker()
        command = [str(INSTALL), "--artifact-dir", str(self.artifact), "--release-root", str(releases), "--source-sha", self.sha, "--apply"]
        first = subprocess.run(command, text=True, capture_output=True, env=environment, check=False)
        self.assertEqual(first.returncode, 0, first.stderr)
        destination = releases / self.sha
        manifest = json.loads((destination / ".asodef-release-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["sourceSha"], self.sha)
        self.assertRegex(manifest["apiImageId"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(
            manifest["aiRuntimeProvisionerSha256"],
            hashlib.sha256((destination / "ops/production/provision-ai-runtime.py").read_bytes()).hexdigest(),
        )
        self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o555)
        second = subprocess.run(command, text=True, capture_output=True, env=environment, check=False)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("changed=NO", second.stdout)

    def test_failed_image_build_never_installs_partial_release(self) -> None:
        releases = self.root / "releases-fail"
        releases.mkdir()
        _, environment = self.fake_docker(fail_web=True)
        failed = subprocess.run(
            [str(INSTALL), "--artifact-dir", str(self.artifact), "--release-root", str(releases), "--source-sha", self.sha, "--apply"],
            text=True,
            capture_output=True,
            env=environment,
            check=False,
        )
        self.assertNotEqual(failed.returncode, 0)
        self.assertFalse((releases / self.sha).exists())
        self.assertEqual(list(releases.iterdir()), [])

    def test_publisher_verifies_exact_green_main_run_without_remote_mutation(self) -> None:
        fake_bin = self.root / "publisher-bin"
        fake_bin.mkdir()
        gh = fake_bin / "gh"
        gh.write_text(
            "#!/usr/bin/env python3\n"
            "import json,os,pathlib,shutil,sys\n"
            "args=sys.argv[1:]\n"
            "if args[:2]==['run','view']:\n"
            " print(json.dumps({'headSha':os.environ['FAKE_SHA'],'headBranch':'main','event':'push','status':'completed','conclusion':'success','url':'https://example.invalid/run'})); sys.exit(0)\n"
            "if args[0]=='api': print('sha256:'+'d'*64); sys.exit(0)\n"
            "if args[:2]==['run','download']:\n"
            " target=pathlib.Path(args[args.index('--dir')+1]); source=pathlib.Path(os.environ['FAKE_ARTIFACT']);\n"
            " [shutil.copy2(item,target/item.name) for item in source.iterdir()]; sys.exit(0)\n"
            "sys.exit(7)\n",
            encoding="utf-8",
        )
        gh.chmod(0o755)
        key = self.root / "ssh-key"
        key.write_text("synthetic-not-a-key\n", encoding="utf-8")
        key.chmod(0o600)
        environment = os.environ.copy()
        environment["PATH"] = f"{fake_bin}:{environment['PATH']}"
        environment["FAKE_SHA"] = self.sha
        environment["FAKE_ARTIFACT"] = str(self.artifact)
        result = subprocess.run(
            [str(PUBLISH), "--repository", "DevOps-Solutions-IA/Asodef", "--source-sha", self.sha, "--run-id", self.run_id, "--host", "example.invalid", "--user", "asodefadmin", "--ssh-key", str(key), "--release-root", "/opt/asodef/public-platform/releases"],
            text=True,
            capture_output=True,
            env=environment,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("provenance=PASS", result.stdout)


if __name__ == "__main__":
    unittest.main()
