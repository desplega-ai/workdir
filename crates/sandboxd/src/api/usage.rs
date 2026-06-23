//! Usage, billing, admin overview, and public benchmark endpoints
//! (spec §21, §22, §23).

use crate::auth::AuthContext;
use crate::catalog::ImageClass;
use crate::error::{ApiError, ApiResult};
use crate::knobs::Resources;
use crate::pricing;
use crate::state::AppState;
use axum::extract::State;
use axum::{Extension, Json};
use chrono::{Datelike, TimeZone, Utc};
use serde_json::{json, Value};

pub async fn usage(
    State(state): State<AppState>,
    Extension(ctx): Extension<AuthContext>,
) -> ApiResult<Json<Value>> {
    let now = Utc::now();
    let intervals = state
        .store
        .usage_for_org(&ctx.org_id)
        .map_err(ApiError::Internal)?;
    let total_cost: f64 = intervals.iter().map(|iv| iv.cost_usd(now)).sum();
    let delivered_unit_seconds: f64 = intervals
        .iter()
        .map(|iv| iv.delivered_unit_seconds(now))
        .sum();
    let org = state
        .store
        .get_org(&ctx.org_id)
        .map_err(ApiError::Internal)?;

    let mut per_sandbox = std::collections::BTreeMap::<String, (f64, f64)>::new();
    for iv in &intervals {
        let e = per_sandbox
            .entry(iv.sandbox_id.clone())
            .or_insert((0.0, 0.0));
        e.0 += iv.seconds(now);
        e.1 += iv.cost_usd(now);
    }
    let sandboxes: Vec<Value> = per_sandbox
        .into_iter()
        .map(|(id, (secs, cost))| json!({ "sandbox_id": id, "running_seconds": secs.round(), "cost_usd": round6(cost) }))
        .collect();

    Ok(Json(json!({
        "org_id": ctx.org_id,
        "total_cost_usd": round6(total_cost),
        "delivered_unit_seconds": delivered_unit_seconds.round(),
        "prepaid_credits_usd": org.as_ref().map(|o| o.prepaid_credits_usd),
        "balance_usd": org.as_ref().map(|o| round6(o.balance_usd())),
        "quota_units": org.as_ref().map(|o| o.quota_units),
        "sandboxes": sandboxes,
    })))
}

pub async fn admin_overview(
    State(state): State<AppState>,
    Extension(ctx): Extension<AuthContext>,
) -> ApiResult<Json<Value>> {
    if !ctx.admin {
        return Err(ApiError::Forbidden("admin only".into()));
    }
    let now = Utc::now();
    let nodes = state.store.list_nodes().map_err(ApiError::Internal)?;
    let all_usage = state.store.all_usage().map_err(ApiError::Internal)?;
    let active = state
        .store
        .all_active_sandboxes()
        .map_err(ApiError::Internal)?;

    // Reconcile a MONTH of node cost against a MONTH of delivered units (review
    // #11): clip each interval to the current calendar month so the published
    // at-cost price doesn't trend to zero as history accumulates.
    let month_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .unwrap_or(now);
    let delivered_unit_hours: f64 = all_usage
        .iter()
        .map(|iv| {
            let start = iv.started_at.max(month_start);
            let end = iv.ended_at.unwrap_or(now).max(start);
            let secs = (end - start).num_milliseconds().max(0) as f64 / 1000.0;
            secs * iv.resource_units * iv.image_multiplier
        })
        .sum::<f64>()
        / 3600.0;
    let monthly_node_cost = state.cfg.pricing.monthly_node_cost_usd * nodes.len().max(1) as f64;
    let platform_overhead = monthly_node_cost * 0.25; // control plane + fees + abuse reserve
    let reconciled = pricing::reconciled_unit_price_usd_hr(
        monthly_node_cost,
        platform_overhead,
        delivered_unit_hours.max(1e-6),
    );

    let base_price =
        pricing::sandbox_price_usd_hr(&state.cfg.pricing, &Resources::default(), &ImageClass::Base);

    Ok(Json(json!({
        "nodes": nodes.len(),
        "active_sandboxes": active.len(),
        "hot_pools": state.local.pool_status().await,
        "delivered_unit_hours": round6(delivered_unit_hours),
        "cost": {
            "monthly_node_cost_usd": monthly_node_cost,
            "platform_overhead_usd": platform_overhead,
            "reconciled_unit_price_usd_hr": round6(reconciled),
            "configured_unit_price_usd_hr": state.cfg.pricing.default_unit_price_usd_hr,
            "default_base_price_usd_hr": round6(base_price),
        },
        "abuse_alerts": [],
        "runtime": state.local.runtime_kind(),
    })))
}

pub async fn benchmarks(
    State(state): State<AppState>,
    Extension(ctx): Extension<AuthContext>,
) -> ApiResult<Json<Value>> {
    // Phase 0 latency table: p50/p90/p95 per (image, boot_path) from the harness
    // (spec §21.3). The boot paths are reported separately and never merged, so
    // best-case hot-pool numbers are never published unlabeled.
    let harness = state
        .store
        .all_benchmark_samples()
        .map_err(ApiError::Internal)?;
    let series = aggregate(harness.iter().map(|s| {
        (
            s.image.clone(),
            s.boot_path.as_str().to_string(),
            s.ready_ms,
            s.create_to_echo_ms,
        )
    }));

    // Secondary series: timings observed from real sandboxes, scoped to the
    // caller's org (admins see the whole fleet) so cross-org timings don't leak.
    let sandboxes = if ctx.admin {
        state
            .store
            .all_active_sandboxes()
            .map_err(ApiError::Internal)?
    } else {
        state
            .store
            .list_sandboxes_for_org(&ctx.org_id)
            .map_err(ApiError::Internal)?
    };
    let observed = aggregate(sandboxes.iter().map(|s| {
        let total = (s.timings.boot_ms + s.timings.image_cache_ms).max(1);
        (
            s.image.clone(),
            s.boot_path.as_str().to_string(),
            total,
            total,
        )
    }));

    let base_price =
        pricing::sandbox_price_usd_hr(&state.cfg.pricing, &Resources::default(), &ImageClass::Base);
    let nodes = state.store.list_nodes().map_err(ApiError::Internal)?;
    Ok(Json(json!({
        "series": series,
        "observed": observed,
        "samples": harness.len(),
        "current_hosted_at_cost_default_price_usd_hr": round6(base_price),
        "node_count": nodes.len(),
        "runtime": state.local.runtime_kind(),
        "targets": { "snapshot_restore_ms_p50": 25, "snapshot_restore_ms_p90": 50, "standby_resume_ms": 200 },
        "note": "hot_pool, snapshot_restore and cold_boot are measured and reported separately, never merged; run a fresh sweep with POST /v1/benchmarks/run (admin)",
    })))
}

/// Admin-only: actively run a benchmark sweep on this node and return the
/// freshly-recomputed latency table (roadmap Phase 0).
pub async fn run_benchmarks(
    State(state): State<AppState>,
    Extension(ctx): Extension<AuthContext>,
    body: Option<Json<Value>>,
) -> ApiResult<Json<Value>> {
    if !ctx.admin {
        return Err(ApiError::Forbidden("admin only".into()));
    }
    let body = body.map(|Json(b)| b).unwrap_or(Value::Null);
    // Default to a full baseline across every curated image; pass a single
    // curated name to sweep just one.
    let image = body
        .get("image")
        .and_then(|v| v.as_str())
        .unwrap_or("all")
        .to_string();
    let iterations = body
        .get("iterations")
        .and_then(|v| v.as_u64())
        .unwrap_or(5)
        .clamp(1, 50) as u32;
    let fresh = crate::bench::run_sweep(&state, &image, iterations).await;
    let series = aggregate(fresh.iter().map(|s| {
        (
            s.image.clone(),
            s.boot_path.as_str().to_string(),
            s.ready_ms,
            s.create_to_echo_ms,
        )
    }));
    Ok(Json(json!({
        "ran": fresh.len(),
        "image": image,
        "iterations": iterations,
        "series": series,
        "runtime": state.local.runtime_kind(),
    })))
}

/// Fold (image, boot_path, ready_ms, echo_ms) rows into a per-path p50/p90/p95
/// summary.
fn aggregate(rows: impl Iterator<Item = (String, String, u64, u64)>) -> Vec<Value> {
    let mut ready: std::collections::BTreeMap<(String, String), Vec<u64>> = Default::default();
    let mut echo: std::collections::BTreeMap<(String, String), Vec<u64>> = Default::default();
    for (image, path, r, e) in rows {
        ready
            .entry((image.clone(), path.clone()))
            .or_default()
            .push(r.max(1));
        echo.entry((image, path)).or_default().push(e.max(1));
    }
    let mut out = vec![];
    for ((image, boot_path), mut vals) in ready {
        vals.sort_unstable();
        let mut evals = echo
            .remove(&(image.clone(), boot_path.clone()))
            .unwrap_or_default();
        evals.sort_unstable();
        out.push(json!({
            "image": image,
            "boot_path": boot_path,
            "samples": vals.len(),
            "ready_ms_p50": crate::bench::percentile(&vals, 50.0),
            "ready_ms_p90": crate::bench::percentile(&vals, 90.0),
            "ready_ms_p95": crate::bench::percentile(&vals, 95.0),
            "create_to_echo_ms_p50": crate::bench::percentile(&evals, 50.0),
            "create_to_echo_ms_p95": crate::bench::percentile(&evals, 95.0),
        }));
    }
    out
}

fn round6(v: f64) -> f64 {
    (v * 1_000_000.0).round() / 1_000_000.0
}
