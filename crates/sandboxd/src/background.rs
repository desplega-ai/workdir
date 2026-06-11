//! Background loops: hot-pool warmer, idle auto-stop detector, and node
//! heartbeat (spec §9.1 hot pools, §13 auto-stop, §8 scaling triggers).

use crate::lifecycle::State;
use crate::service;
use crate::state::AppState;
use chrono::Utc;
use std::time::Duration;

/// Reconcile hot pools toward their targets (spec §9.1, §10.1).
pub fn spawn_warmer(state: AppState) {
    let interval = state.cfg.hotpool.warm_interval_seconds.max(1);
    tokio::spawn(async move {
        if !state.cfg.hotpool.enabled {
            return;
        }
        loop {
            let warmed = state.local.warm_once().await;
            if warmed > 0 {
                tracing::debug!(warmed, "warmed hot-pool VMs");
            }
            tokio::time::sleep(Duration::from_secs(interval)).await;
        }
    });
}

/// Park sandboxes idle past their window in perpetual standby (roadmap Phase 1):
/// snapshot, free RAM, `$0` billing, auto-resume on the next request. This is
/// the loop that reframes workdir from a sandbox API into a perpetual-sandbox
/// platform — an idle sandbox stays logically alive but stops costing anything.
///
/// A sandbox with resident secrets is never snapshotted (review M3), so it
/// falls back to a plain stop (explicit resume required). Browser/VNC activity
/// bumps `last_active_at` via exec/preview touches, as before.
pub fn spawn_idle_reaper(state: AppState) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            let active = match state.store.all_active_sandboxes() {
                Ok(v) => v,
                Err(e) => {
                    tracing::warn!(error = %e, "idle reaper: list failed");
                    continue;
                }
            };
            let now = Utc::now();
            for sb in active {
                if sb.state != State::Running {
                    continue;
                }
                let idle = (now - sb.last_active_at).num_seconds();
                if idle < sb.auto_stop_seconds as i64 {
                    continue;
                }
                // Standby is gated (off by default) so the snapshot/restore path
                // is validated on a node before real sandboxes depend on it. A
                // sandbox with resident secrets is never snapshotted (review M3),
                // so it always takes the plain stop path.
                if state.cfg.standby.enabled && sb.secret_names.is_empty() {
                    tracing::info!(sandbox = %sb.id, idle_s = idle, "idle -> standby (snapshot + free RAM)");
                    if let Err(e) = service::standby_sandbox(&state, sb).await {
                        tracing::warn!(error = %e, "standby failed");
                    }
                } else {
                    tracing::info!(sandbox = %sb.id, idle_s = idle, "idle -> stop");
                    if let Err(e) = service::stop_sandbox(&state, sb).await {
                        tracing::warn!(error = %e, "auto-stop failed");
                    }
                }
            }
        }
    });
}

/// Stop sandboxes for orgs whose real-time balance has hit zero. Persisted
/// `spent_usd` only updates when an interval closes, so without this a
/// long-running sandbox bills indefinitely past the org's prepaid credit
/// (review #8). The bootstrap admin org is exempt (mirrors the create bypass).
pub fn spawn_credit_enforcer(state: AppState) {
    tokio::spawn(async move {
        let admin_org = state.cfg.auth.bootstrap_org.clone();
        loop {
            tokio::time::sleep(Duration::from_secs(20)).await;
            let active = match state.store.all_active_sandboxes() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let now = Utc::now();
            // Distinct orgs that currently have running sandboxes.
            let mut orgs: Vec<String> = active.iter().map(|s| s.org_id.clone()).collect();
            orgs.sort();
            orgs.dedup();
            for org_id in orgs {
                if org_id == admin_org {
                    continue;
                }
                let org = match state.store.get_org(&org_id) {
                    Ok(Some(o)) => o,
                    _ => continue,
                };
                let intervals = state.store.usage_for_org(&org_id).unwrap_or_default();
                if crate::usage::live_balance_usd(&org, &intervals, now) > 0.0 {
                    continue;
                }
                tracing::warn!(org = %org_id, "org out of credit — stopping its sandboxes");
                for sb in active.iter().filter(|s| s.org_id == org_id && s.state == State::Running) {
                    if let Err(e) = service::stop_sandbox(&state, sb.clone()).await {
                        tracing::warn!(error = %e, sandbox = %sb.id, "credit-stop failed");
                    }
                }
            }
        }
    });
}

/// Garbage-collect expired ephemeral images once no active sandbox references
/// them (feature). Soft-deletes so running sandboxes are unaffected (spec §25.3).
pub fn spawn_image_gc(state: AppState) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let now = Utc::now();
            let images = match state.store.all_images() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let active = state.store.all_active_sandboxes().unwrap_or_default();
            for mut img in images {
                if !img.ephemeral {
                    continue;
                }
                let expired = img.expires_at.map(|t| now >= t).unwrap_or(false);
                if !expired {
                    continue;
                }
                let reference = img.reference();
                let referenced = active.iter().any(|s| s.image == reference || s.image == img.name);
                if referenced {
                    continue;
                }
                img.status = crate::images::ImageStatus::Deleted;
                img.updated_at = now;
                if state.store.put_image(&img).is_ok() {
                    tracing::info!(image = %reference, "GC'd expired ephemeral image");
                }
            }
        }
    });
}

/// Keep the local node's heartbeat fresh so the registry/dashboard see it live.
pub fn spawn_heartbeat(state: AppState) {
    tokio::spawn(async move {
        loop {
            if let Ok(Some(mut node)) = state.store.get_node(&state.local_node_id) {
                node.last_heartbeat_at = Utc::now();
                state.store.put_node(&node).ok();
            }
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
}
