# Production closure privileged-channel operator gate

This is a single unavoidable human root bootstrap after the exact-main release
artifact has been published and before `.stack.env` or the running stack is
changed. It never reads or prints the SMTP password.

Use the exact values recorded by the release ledger. The target API/Web tags
must share the new 40-character SHA. The previous tags must be the currently
healthy rollback images, and all four tags must be accompanied by the full
`sha256:<64-hex>` IDs recorded by the sanitized release/preflight ledger.
First run the installer without `--apply`; then repeat with `--apply` only when
it reports `status=ready`.

The operator performs these bounded actions with interactive sudo:

1. create a fresh root-owned temporary directory under `/var/lib`;
   and ensure `/usr/local/libexec/asodef/privileged-releases` exists as a
   root-owned `0755` directory with no symlinked or writable ancestors;
2. copy only `install-production-privileged-channel.py` from the published
   release into it as `root:root 0700`;
3. compare that copy's SHA-256 with `privilegedInstallerSha256` in the release
   manifest;
4. run the root-owned copy with the exact source SHA, target images, previous
   images, fixed shared directory and fixed mail config;
5. allow the installer to validate images/tree, install the privileged release,
   validate sudoers with `visudo`, and atomically install the sudoers file;
6. remove the temporary root-owned copy after success;
7. confirm `sudo -n -l` contains only the ten new digest-bound commands,
   including separate exact deployment dry-run/apply commands and the full
   mail and hostile-relay verification entrypoints;
8. confirm `sudo -n bash`, `sudo -n sh`, `sudo -n docker`,
   `sudo -n systemctl` and `sudo -n ufw` remain denied.

Do not execute the installer directly from the operator-owned application
release. It rejects that mode in production. Do not add `NOPASSWD: ALL`, a
shell, Docker, systemd, UFW, wildcards or user-controlled paths to sudoers.

Expected sanitized evidence:

```text
ROOT_BOOTSTRAP_ROOT_OWNED=PASS
ROOT_BOOTSTRAP_HASH=PASS
PRIVILEGED_RELEASE_IMMUTABLE=PASS
SUDOERS_VISUDO=PASS
SUDOERS_EXACT_COMMANDS=10
DIRECT_SHELL_DOCKER_SYSTEMCTL_UFW=DENIED
```

After this gate, automation may run the exact env provision/validation,
API/Web deploy dry-run/apply/rollback and mail-network verification commands
without another privilege expansion. Both deployment forms bind the same exact
SHA, image tags, image IDs and executable digest; the dry-run simply omits
`--apply` so it can validate the root-owned `0600` stack environment without
mutating production. The existing `ASODEF_PHASE1_MAIL_MUTATION` channel and its
`fdexec=never` default remain unchanged.
