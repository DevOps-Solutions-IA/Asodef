# Production Compose contract

This directory is the only supported orchestration path for rebuilding the
ASODEF public API/Web in Phase 1. It fixes the Compose project and combines,
in order:

1. the existing production base;
2. the existing Master tunnel overlay;
3. the versioned mail overlay;
4. the versioned Admin Core environment overlay;
5. an immutable release-image overlay.

All interpolation uses
`/opt/asodef/public-platform/shared/.stack.env` through Compose `--env-file`.
No operator shell exports are part of the contract. The installer never edits
the base, Master overlay or protected env file and never runs `down`.

## Exact-SHA artifact and image publication

After the normal CI job passes on a push to `main`, GitHub Actions creates the
short-lived artifact `asodef-production-<sha>`. It contains a deterministic
`git archive`, strict JSON provenance and SHA-256 checksums, never runtime env
files or credentials. `publish-release.sh` accepts only a completed successful
`push` run whose branch is `main` and whose head is the requested SHA.

The versioned remote installer rejects links, traversal, duplicate paths,
changed hashes and an existing release with different provenance. It builds
API/Web images from that exact source, labels both with
`org.opencontainers.image.revision=<sha>`, records full Image IDs, makes the
tree read-only and atomically installs it under
`/opt/asodef/public-platform/releases/<sha>`. Re-running the same release is
idempotent and never overwrites a prior release.

From the trusted workstation, publication is a single versioned command (the
run must be the exact successful `main` run that produced the artifact):

```sh
ops/production/publish-release.sh \
  --repository DevOps-Solutions-IA/Asodef \
  --source-sha <exact-green-main-sha> \
  --run-id <exact-main-ci-run-id> \
  --host 169.58.36.138 --user asodefadmin \
  --ssh-key /home/wundah/.ssh/asodef_phase1_temp \
  --release-root /opt/asodef/public-platform/releases \
  --apply
```

The command records both the internal source archive hash and GitHub's
artifact digest. SSH/SCP are implementation details of this reviewed
entrypoint, not operator-authored copy commands.

## Protected runtime env

`provision-stack-env.py` is the only supported path for adding Admin and SMTP
overlay keys to `.stack.env`. It preserves the four PostgreSQL/Redis
interpolation keys, rejects unknown or duplicate keys, reads `ENCRYPTION_KEY`
from the existing application env and reads the SMTP password directly from
the certified root-only password file. The password is never an argument,
environment variable or log value.

The entrypoint uses `flock`, a root-only backup, same-directory temporary file,
`fsync`, atomic rename and a single-use rollback pointer. The resulting file
is `root:root 0600`; Compose therefore runs only through the bounded
privileged deployment entrypoint. Output contains key counts and state names,
not values.

## Release-specific privileged channel

`install-production-privileged-channel.py` is a one-time human root bootstrap.
The operator first copies it to a new root-owned non-symlink temporary file
with mode `0700`; it verifies its own hash against the installed release
manifest, the source tree and both image IDs. It copies only the three scoped
ops trees into a root-owned privileged release and validates sudoers with
`visudo` before atomic installation.

The generated `ASODEF_PHASE1_PRODUCTION_CLOSURE` alias authorizes only exact
digest+argument combinations for env provision/rollback, env validation,
API/Web deploy/rollback and mail-network verification. Its `fdexec=never`
default does not alter the existing `ASODEF_PHASE1_MAIL_MUTATION` alias and it
does not grant direct shell, Docker, systemd or UFW commands.

The root bootstrap is deliberately not NOPASSWD. The operator copies the
installer from the published release into a fresh root-owned `0700` temporary
file, invokes that copy interactively with exact target/previous image tags,
and deletes the temporary copy only after `visudo` and negative privilege
checks pass. The installer itself rejects a non-root-owned copy or a hash that
does not match the release manifest. This is the only unavoidable privileged
human action in this mechanism.

## Safe release sequence

Run the installer without `--apply` first. It stages the two versioned
overlays and exact API/Web image references, then validates the fully merged
model without printing resolved environment values:

```sh
ops/production/install-compose-contract.sh \
  --shared-dir /opt/asodef/public-platform/shared \
  --api-image asodef-public-platform-api:<exact-green-main-sha> \
  --web-image asodef-public-platform-web:<exact-green-main-sha>
```

After image, backup, restore and identity gates pass, repeat the bounded
deployment entrypoint with `--apply`. It atomically installs only the managed
mail/Admin/release overlays, records a private backup pointer, validates the
installed model and recreates only API/Web. Before changing those overlays or
containers, it runs the exact API image's local Prisma binary against the
private production data network, requires all 40 checked-in migrations, and
verifies `migrate status`. A migration failure leaves the running API/Web and
the installed Compose contract unchanged:

```sh
ops/production/deploy-public-platform.sh \
  --shared-dir /opt/asodef/public-platform/shared \
  --source-sha <exact-green-main-sha> \
  --api-image asodef-public-platform-api:<exact-green-main-sha> \
  --api-image-id sha256:<exact-64-hex-image-id> \
  --web-image asodef-public-platform-web:<exact-green-main-sha> \
  --web-image-id sha256:<exact-64-hex-image-id> \
  --apply
```

The release-specific sudo command binds those full image IDs and the OCI
revision label. A retagged or rebuilt image is rejected immediately before
Compose changes anything. The rollback command is likewise bound to the full
IDs of the previously healthy images.

The deployment must occur after the external mail network exists and before
mail activation. The full order is network → prepare → firewall → Compose
contract/API attachment → `verify-mail-network.sh CONFIG --attachment-only` →
activate → full `verify-mail-network.sh CONFIG` → verify → hostile SMTP tests.
The attachment-only mode proves the sole API member and fixed IP before
Postfix starts; the full mode additionally requires the private listener and
proves there is no public 587 bind.

Before deploy, provision and validate the protected env through that exact
sudo channel. The residual non-official `SUPER_ADMIN` must then be removed via
the currently deployed UI/API procedure in
`ops/admin-core/residual-privilege-operator-gate.md`; it is a human gate and
never uses SQL.

Rollback uses `ops/admin-core/rollback-public-admin-core.sh` with the same
fixed contract and prior immutable image references. It recreates only API/Web,
preserves both Master and mail attachments, and never removes external
networks, firewall rules, Postfix state or protected stacks.

If the entire mail Compose integration must be withdrawn, use
`rollback-compose-contract.sh` with the prior immutable API/Web images. It
restores the exact managed-overlay state recorded immediately before install,
recreates only API/Web, and leaves external networks and host mail state
untouched. Only after API is declaratively detached may the separately owned
mail runtime and external network rollback scripts run.

The env rollback restores the exact prior content, owner and mode from its
root-only backup and consumes the pointer to prevent accidental replay.
