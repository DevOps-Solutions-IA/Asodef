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
installed model and recreates only API/Web:

```sh
ops/production/deploy-public-platform.sh \
  --shared-dir /opt/asodef/public-platform/shared \
  --api-image asodef-public-platform-api:<exact-green-main-sha> \
  --web-image asodef-public-platform-web:<exact-green-main-sha> \
  --apply
```

The deployment must occur after the external mail network exists and before
mail activation. The full order is network → prepare → firewall → Compose
contract/API attachment → `verify-mail-network.sh CONFIG --attachment-only` →
activate → full `verify-mail-network.sh CONFIG` → verify → hostile SMTP tests.
The attachment-only mode proves the sole API member and fixed IP before
Postfix starts; the full mode additionally requires the private listener and
proves there is no public 587 bind.

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
