#!/usr/bin/env bash
# Nightly off-box backup of the workdir node's irreplaceable state to Cloudflare
# R2 via restic. The SQLite DB is handled separately by Litestream (continuous);
# this covers what Litestream doesn't:
#   • secret.key       — the AES master key for org secrets. RUNBOOK: if lost,
#                        ALL stored secrets are unrecoverable. This is the single
#                        most important file on the box.
#   • volumes/         — persistent volume images (customer data that outlives
#                        sandboxes).
#   • images/custom/   — published custom-image rootfs artifacts.
# Standby snapshots and curated images are deliberately NOT backed up — they are
# reproducible (rebuild) or ephemeral.
#
# Config: /etc/workdir/backup.env provides R2 creds + restic password:
#   R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, RESTIC_PASSWORD
set -euo pipefail

. /etc/workdir/backup.env

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RESTIC_PASSWORD
export RESTIC_REPOSITORY="s3:${R2_ENDPOINT}/${R2_BUCKET}/workdir-state"

DATA=/var/lib/workdir

# Initialize the repo once (idempotent: ignore "already initialized").
restic snapshots >/dev/null 2>&1 || restic init

restic backup \
  --tag nightly \
  --exclude "$DATA/workdir.db-wal" --exclude "$DATA/workdir.db-shm" \
  "$DATA/secret.key" \
  "$DATA/volumes" \
  "$DATA/images/custom" \
  2>&1

# Keep a sensible retention ladder; prune old data from R2.
restic forget --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune 2>&1

echo "backup-state: done $(date -u +%FT%TZ)"
