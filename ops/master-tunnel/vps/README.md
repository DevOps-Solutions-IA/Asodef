# Private Master tunnel on the ASODEF VPS

These files define a stable, API-only path from the ASODEF production API to
the SSH reverse tunnel. They do not publish Firebird and do not touch the
protected WhatsApp Manager stack.

## Network contract

| Item | Value |
| --- | --- |
| External Docker network | `asodef_master_tunnel` |
| Linux bridge | `asodef-master0` |
| Subnet | `172.25.51.0/29` |
| Host/tunnel listener | `172.25.51.1:33051` |
| API address | `172.25.51.2` |
| Internet publication | none |

The dedicated network is `--internal`, has an explicit IPAM contract and is
created outside the Compose project lifecycle. Recreating the API does not
change its address and `docker compose down` does not remove the network.

## Controlled installation

All commands are dry-run unless explicitly passed `--apply`.

1. Run `./create-master-network.sh` and inspect the proposed command.
2. With operator approval, run `./create-master-network.sh --apply`.
3. Install the reviewed sshd Match block using
   `sshd-asodef-tunnel.conf.example` and validate with `sudo sshd -t` before
   reloading sshd. Do not restart sshd.
4. Update the Windows reverse forward to listen only on
   `172.25.51.1:33051`.
5. Run `./configure-master-firewall.sh` and inspect the UFW command.
6. With operator approval, run `./configure-master-firewall.sh --apply`.
7. Add `docker-compose.master-tunnel.yml` to the production Compose invocation
   and recreate **only** the ASODEF public API.
8. Run `./verify-master-network.sh` and `./verify-host-security.sh`.
9. Run a trustworthy probe from an independent Internet host. The execution
   environment used during the audit returned SYN-ACK for arbitrary control
   ports, so it cannot prove Internet exposure.

Do not proceed unless the effective sshd policy and nftables/UFW rules have
been inspected with privilege. Do not make changes to any
`asodef-whatsapp-manager-production_*` object.

## Rollback

1. Restore the Windows reverse-forward target to the previously recorded
   listener while the old policy is still present.
2. Recreate only the public API without the Compose override.
3. Delete the exact numbered UFW rule created for
   `ASODEF API to private Firebird reverse tunnel`.
4. Restore the timestamped sshd configuration backup, run `sudo sshd -t`, and
   reload sshd only when validation passes.
5. When no endpoint remains attached, remove `asodef_master_tunnel`.
6. Confirm the public API is healthy and compare all six protected container
   IDs, restart counts and health states with the pre-change snapshot.

Database, Redis, the protected stack, Firebird and its credentials are not
part of this rollback.
