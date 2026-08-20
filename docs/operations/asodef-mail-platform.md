# ASODEF mail platform operator runbook

## Certified runtime baseline (2026-08-20)

| Control | Observed state |
| --- | --- |
| `smtp.asodef.com.co` | A `169.58.36.138`; PASS from `1.1.1.1` and `8.8.8.8` |
| VPS IPv4 | `169.58.36.138` |
| PTR / FCrDNS | `smtp.asodef.com.co`; PASS from both external resolvers |
| Existing MX | GoDaddy `smtp.secureserver.net` and `mailstore1.secureserver.net` |
| Existing SPF | VPS IPv4 plus `include:secureserver.net`; PASS |
| Existing DMARC | present with `p=quarantine`, relaxed alignment |
| DKIM selector | immutable `asodef2026`; DNS and real signing PASS |
| Outbound TCP/25 | reachable from VPS to Gmail, Outlook and GoDaddy |
| Host MTA | Postfix and OpenDKIM installed; OpenDKIM `127.0.0.1:8891` |
| SMTP TLS certificate | valid for `smtp.asodef.com.co`, TLS 1.3 verified; expires 2026-11-18 |
| SASL/private submission | packages incomplete; TCP/587 not configured |

The dedicated mail network and private submission listener are not active yet.
Public 25/465/587 denial still requires independent-network certification after
the owned firewall rules and private listener are activated.

## Target topology and trust boundaries

```text
ASODEF API 172.25.52.2/29
  -> dedicated internal network asodef_mail_submission / asodef-mail0
  -> TCP/587 STARTTLS + SASL
  -> Postfix 172.25.52.1:587 (private bind; smtp.asodef.com.co TLS identity)
  -> OpenDKIM on loopback 127.0.0.1:8891
  -> remote recipient MX on outbound TCP/25

Internet -> TCP/587 DENY
Internet -> TCP/465 DENY
Internet -> TCP/25 DENY while GoDaddy remains MX
```

PostgreSQL, Redis, Master/Firebird, R3, Bold, payments and the protected
WhatsApp stack are outside this topology and must not be modified.

The `/29` contract has passed the overlap gate but must be rechecked immediately
before creation. It must never
reuse `asodef_master_tunnel`, `data` or `egress`. The API-only Compose overlay
adds a fixed `.2` member and maps the SMTP hostname internally to host `.1`,
preserving TLS hostname verification without a public submission listener.

## DNS plan (operator/provider actions)

The production selector is exactly `asodef2026`. Do not regenerate its key or
change the selector during this closure.

1. Preserve and verify `A smtp.asodef.com.co 169.58.36.138`.
2. Preserve and verify provider PTR `169.58.36.138 -> smtp.asodef.com.co`.
3. Keep both current MX records unchanged. This relay is outbound-only.
4. Preserve the single certified SPF record
   `v=spf1 ip4:169.58.36.138 include:secureserver.net -all`. Never publish a
   second SPF record.
   The managed relay remains IPv4-only while this policy is active. Enabling
   IPv6 delivery additionally requires an aligned IPv6 PTR and an explicit
   `ip6:` SPF mechanism before changing `inet_protocols`.
5. Preserve the certified `asodef2026._domainkey.asodef.com.co` record. Never
   copy, print or regenerate the private key.
6. Preserve the current DMARC record and `p=quarantine` during coexistence.
   Do not change policy or reporting destination without domain-owner approval.
7. Confirm A, PTR, SPF, DKIM and DMARC from at least two independent resolvers.

All seven actions are `REQUIRES_OPERATOR_APPROVAL`. DNS rollback removes only
the new A, DKIM selector and VPS SPF mechanism after application rollback; it
must not remove the existing GoDaddy include, MX or DMARC record.

## Startup and verification order

1. Freeze exact application release SHA and capture current production state.
2. Reconfirm the already-certified A/PTR/FCrDNS/SPF/DKIM/DMARC state.
3. Create root-owned, non-symlink `0600` config and password files outside Git.
4. Validate/create the dedicated network and attach only the public API through
   the overlay during an authorized API-only recreate.
5. Run the read-only runtime reconciler and adopt the existing certificate from
   `/etc/postfix/tls` and DKIM selector/key. Certificate issuance and DKIM
   generation are prohibited in this closure.
6. Inventory the existing Postfix queue count. Any nonzero count blocks until
   an operator reconciles it; never flush, requeue or discard it blindly.
7. Verify DNS using two independent resolvers.
8. Apply exact owned UFW rules, then activate services.
9. Run host, network, loopback-relay, bad-HELO, auth, spoof, oversize and TLS tests.
10. Send controlled Gmail and Outlook deliveries from the approved From address.
11. Verify `SPF=pass`, `DKIM=pass`, `DMARC=pass`, aligned From, TLS and sane
   rendering from full headers without publishing recipient PII.
12. Only after mail certification, configure ASODEF Outbox SMTP secrets and run
    recovery E2E through the durable job path.

## Failure and recovery

- DNS/PTR/TLS mismatch: keep Postfix/OpenDKIM stopped; do not send.
- Open-relay or sender-spoof test failure: stop Postfix immediately and preserve
  logs/config for diagnosis.
- SMTP temporary failure: Outbox owns bounded retry/backoff.
- SMTP permanent failure: classify without blind retry.
- Unknown SMTP acceptance result: preserve `UNKNOWN_RESULT`; never retry blindly.
- Certificate renewal failure: existing certificate remains in use; alert before
  expiry and never substitute a self-signed certificate. The deploy hook must
  verify hostname, expiry and key match, stage the pair under `/etc/postfix/tls`
  and restore the previous material if `postfix check` or reload fails.
- DKIM failure: stop new delivery, restore the previous selector/key and retain
  both public selectors through the documented overlap.

Rollback sequence: stop application dispatch, stop mail services, execute the
exact host rollback, validate public relay is unavailable, restore application
SMTP configuration, detach only the public API from the mail overlay, remove the
empty mail network, then perform DNS rollback. Host rollback deletes only UFW
rules carrying this run's ownership comments; pre-existing rules are preserved.
Generated DKIM/SASL material is archived under the root-only immutable backup,
not printed. Do not delete queued/unknown or dead-letter Outbox records.
