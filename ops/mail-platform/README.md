# ASODEF transactional mail platform

Reproducible host artifacts for a dedicated outbound Postfix relay signed by
OpenDKIM. This is not a mailbox platform: IMAP, POP3, webmail and human SMTP
accounts are deliberately out of scope.

## Safety model

- `smtp.asodef.com.co` is the SMTP identity and must have matching forward and
  reverse DNS before activation.
- Existing GoDaddy MX records remain authoritative during this phase.
- Public inbound TCP/25 remains denied while those MX records remain in place.
- `asodef_mail_submission` is a dedicated internal Docker network, independent
  of Master and existing data/egress networks. Its proposed contract is
  `172.25.52.0/29`, host gateway `172.25.52.1` and API `172.25.52.2`; creation
  fails if Docker networks or host routes overlap.
- Postfix SMTP and submission bind only to loopback and the dedicated gateway.
  TCP/587 is allowed only from the fixed production API address on `asodef-mail0` and
  still requires TLS plus a dedicated SASL application identity. Public 587 is
  explicitly denied.
- TCP/465 remains denied.
- Relay policy ends in `reject_unauth_destination`; authenticated senders are
  restricted to the configured From identity. Loopback and `mynetworks` do not
  bypass SASL; local `sendmail` submission is restricted to root.
- DKIM private keys and SMTP passwords are generated/stored only on the host.
- Every mutating script requires root and `MAIL_OPERATOR_APPROVAL=YES`.

## Ordered activation

The current production host already has the certified hostname, certificate,
OpenDKIM integration and immutable `asodef2026` selector. This release adopts
those assets; it must not request a certificate or generate/rotate a DKIM key.

1. Copy `mail-platform.env.example` outside Git as a root-owned regular file
   (`0600`), retain `MAIL_DKIM_SELECTOR=asodef2026`, the `/etc/postfix/tls`
   paths and `MAIL_CERTIFICATE_ISSUANCE_BREAK_GLASS=NO`.
2. Run `reconcile-runtime.sh CONFIG --report`. It reads only sanitized runtime
   contracts and planned changes. Any identity, key, TLS or public-587 failure
   blocks adoption.
3. Run `inventory-mail-queue.sh CONFIG`. A nonempty pre-existing queue blocks;
   an operator must reconcile/quarantine it without flush, requeue or deletion.
4. Confirm the already-certified DNS with `verify-dns.sh CONFIG`. Preserve MX,
   SPF, DKIM selector and DMARC.
5. Confirm `172.25.52.0/29` still has no collision. Run
   `create-mail-network.sh CONFIG --dry-run`; after approval use `--apply`.
   Install the complete contract with `ops/production/install-compose-contract.sh`.
   Every subsequent production Compose invocation must use the centralized
   base + Master + mail + Admin + release list and the protected `.stack.env`;
   never attach the API with `docker network connect`. Recreate only API/Web
   when the release gate permits. This keeps API at `172.25.52.2` and preserves
   Master at `172.25.51.2` across deploy and rollback.
6. Operator creates the root-only SMTP password file (`0600`). Never pass the
   password as an argument, environment variable or log field.
7. Set approval `YES` and execute `apply.sh CONFIG --prepare`. It backs up and
   adopts the existing `asodef2026` key and TLS material; missing key material
   fails closed. It never invokes `opendkim-genkey`.
8. Run `preflight.sh CONFIG`; review `configure-firewall.sh CONFIG --dry-run`;
   then apply only the owned mail rules.
9. After the Compose contract has recreated API, run
   `verify-mail-network.sh CONFIG --attachment-only` to prove it is the sole
   member at `172.25.52.2`. Then execute `apply.sh CONFIG --activate`, followed
   by the full `verify-mail-network.sh CONFIG`, `verify.sh CONFIG`, and the
   authorized adversarial/external-network gates. Never run attachment
   verification before the API recreation or full verification before the
   private listener exists.
10. Configure ASODEF production SMTP variables through its protected env
    mechanism, recreate only the public API when release gates authorize it.

`issue-certificate.sh` is disabled by default. It requires both normal operator
approval and `MAIL_CERTIFICATE_ISSUANCE_BREAK_GLASS=YES`; it is not part of the
current closure because the existing certificate is valid. The renewal hook
validates expiry, hostname and certificate/key correspondence, stages new
material under `/etc/postfix/tls`, and restores the previous pair if Postfix
validation or reload fails.

The API runtime value for `SMTP_USER` must be exactly
`MAIL_SMTP_USER@MAIL_DOMAIN`; the sender ownership map and verification gate
enforce that identity. `SMTP_HOST` remains `smtp.asodef.com.co` and is always
used as the TLS certificate identity. The API-only Compose overlay also sets
`SMTP_CONNECT_HOST` to the dedicated gateway because Nodemailer performs DNS
resolution before the operating-system hosts fallback. This keeps the socket
on `172.25.52.1` without weakening hostname verification; `extra_hosts` remains
as an independently verifiable runtime contract for other SMTP clients.

`test-relay-security.sh` never delivers its negative probes: it stops at RCPT,
AUTH or MAIL SIZE. Authorized delivery and Gmail/Outlook header certification
must use separate operator-owned test inboxes and must not expose message
contents or credentials.

## Rollback

`rollback.sh CONFIG` stops Postfix/OpenDKIM, removes only the exact UFW rules
owned by this run, archives generated DKIM/SASL material under the root-only
immutable backup, and restores original files and service states. Installed
packages remain inert for forensic review. `rollback-mail-network.sh` refuses
to remove the network until the public API is detached. DNS rollback is a
separate operator action: remove the VPS `ip4` SPF mechanism and DKIM selector
only after the ASODEF API has stopped using this relay. Preserve existing MX and
DMARC throughout rollback.

## Rotation and renewal

- `rotate-dkim.sh CONFIG NEW_SELECTOR` is a future, separately approved
  rotation tool; do not run it during this closure. It generates a new on-host key and stops
  before switching. Publish and verify the new TXT first; retain the old public
  selector for at least seven days after switching.
- Install `cert-renew-hook.sh` as a Certbot deploy hook. It reloads Postfix only
  after expiry and hostname checks pass.
- Rotate the SMTP password by creating a new root-only file, updating SASL and
  the production secret atomically, validating delivery, then revoking the old
  credential. Never log either value.
- Mail logs must contain queue IDs and outcomes only. Do not enable SASL debug,
  message-body logging, raw SMTP transcripts, or DKIM `LogWhy` in production.
- Outbound Postfix uses opportunistic TLS (`smtp_tls_security_level=may`) because
  public recipient MX capabilities vary. Submission from ASODEF is separately
  protected with mandatory STARTTLS, hostname verification and SASL.

All production mutations and DNS/provider changes are
`REQUIRES_OPERATOR_APPROVAL`.
