# Disaster recovery — restoring a workdir node from R2

Two independent backups cover the node's irreplaceable state:

| What | Tool | R2 prefix | Cadence |
|---|---|---|---|
| Control-plane DB (`workdir.db`) | Litestream | `workdir-db/` | continuous (WAL stream, 1h snapshots) |
| `secret.key`, `volumes/`, `images/custom/` | restic | `workdir-state/` | nightly 03:30 UTC |

`secret.key` is the **AES master key for org secrets** — if it is lost, every
stored secret is unrecoverable. It is in the restic set; keep `RESTIC_PASSWORD`
somewhere off the node (a password manager), because restic data is useless
without it.

## Rebuild a replacement node

1. Provision the base node and the reflink data fs:
   ```bash
   sudo DATA_FS_LOOPBACK_GB=300 bash deploy/provision-node.sh
   sudo systemctl stop workdir          # restore into a quiet data dir
   ```
2. Put the R2 creds back at `/etc/workdir/backup.env` (same values as the dead
   node), then install the tools:
   ```bash
   sudo bash deploy/backup/setup-backups.sh   # installs litestream + restic
   sudo systemctl stop litestream             # don't replicate over the restore
   ```
3. Restore the database:
   ```bash
   sudo litestream restore -config /etc/litestream.yml /var/lib/workdir/workdir.db
   ```
4. Restore secrets + volumes + custom images:
   ```bash
   set -a; . /etc/workdir/backup.env; set +a
   export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
   export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}/workdir-state"
   restic restore latest --target /            # paths are absolute under /var/lib/workdir
   sudo chown -R workdir:workdir /var/lib/workdir
   ```
5. Bring it back up:
   ```bash
   sudo systemctl start workdir litestream
   curl -s 127.0.0.1:8080/healthz
   ```

The control panel re-provisions customer API keys from D1, so those don't need
restoring here. Curated images and standby snapshots are reproducible (rebuild
images, standby VMs were $0/ephemeral) and are intentionally not in the backup.

## Verify backups are healthy (do this monthly)

```bash
# DB stream is current:
litestream snapshots -config /etc/litestream.yml /var/lib/workdir/workdir.db
# State repo has recent nightly snapshots:
set -a; . /etc/workdir/backup.env; set +a
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}/workdir-state"
restic snapshots
```
