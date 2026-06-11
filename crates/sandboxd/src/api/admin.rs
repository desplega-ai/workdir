//! Admin provisioning endpoints used by the Cloudflare control panel to create
//! orgs and register/revoke API keys that this daemon will accept.
//!
//! Both sides store only the SHA-256 hash of a key — the plaintext is generated
//! and shown once by the web app and never travels to the daemon.

use crate::auth::AuthContext;
use crate::error::{ApiError, ApiResult};
use crate::usage::{ApiKey, Org, OrgStatus};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

fn require_admin(ctx: &AuthContext) -> ApiResult<()> {
    if ctx.admin {
        Ok(())
    } else {
        Err(ApiError::Forbidden("admin only".into()))
    }
}

#[derive(Deserialize)]
pub struct CreateOrgReq {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub prepaid_credits_usd: Option<f64>,
    #[serde(default)]
    pub quota_units: Option<f64>,
}

/// Create or update an org. Idempotent on `id` so the web app can call it
/// before every key issuance without checking existence first.
pub async fn create_org(
    State(state): State<AppState>,
    Extension(ctx): Extension<AuthContext>,
    Json(req): Json<CreateOrgReq>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_admin(&ctx)?;
    if req.id.is_empty() {
        return Err(ApiError::BadRequest("org id required".into()));
    }
    let existing = state.store.get_org(&req.id).map_err(ApiError::Internal)?;
    let org = match existing {
        Some(mut o) => {
            // Update mutable fields, keep accrued spend/status.
            o.name = req.name;
            if let Some(c) = req.prepaid_credits_usd {
                o.prepaid_credits_usd = c;
            }
            if let Some(q) = req.quota_units {
                o.quota_units = q;
            }
            o
        }
        None => Org {
            id: req.id.clone(),
            name: req.name,
            status: OrgStatus::Active,
            prepaid_credits_usd: req.prepaid_credits_usd.unwrap_or(5.0), // free starter credit
            spent_usd: 0.0,
            quota_units: req.quota_units.unwrap_or(0.0), // 0 = unlimited
            created_at: Utc::now(),
        },
    };
    state.store.put_org(&org).map_err(ApiError::Internal)?;
    Ok((StatusCode::OK, Json(json!({ "org_id": org.id, "status": org.status }))))
}

#[derive(Deserialize)]
pub struct RegisterKeyReq {
    pub org_id: String,
    /// SHA-256 hex of the full `sk_live_...` key (computed by the web app).
    pub key_hash: String,
    #[serde(default)]
    pub name: Option<String>,
}

/// Register a customer API key by its hash so the daemon accepts it.
pub async fn register_key(
    State(state): State<AppState>,
    Extension(ctx): Extension<AuthContext>,
    Json(req): Json<RegisterKeyReq>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_admin(&ctx)?;
    if state.store.get_org(&req.org_id).map_err(ApiError::Internal)?.is_none() {
        return Err(ApiError::BadRequest(format!("org '{}' does not exist", req.org_id)));
    }
    if req.key_hash.len() != 64 || !req.key_hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ApiError::BadRequest("key_hash must be a SHA-256 hex digest".into()));
    }
    let key = ApiKey {
        key_hash: req.key_hash.clone(),
        org_id: req.org_id,
        name: req.name.unwrap_or_else(|| "dashboard".into()),
        admin: false,
        disabled: false,
        created_at: Utc::now(),
    };
    state.store.put_api_key(&key).map_err(ApiError::Internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "registered": true }))))
}

/// Disable a key (revoke). Kept (not deleted) so it stays auditable.
pub async fn revoke_key(
    State(state): State<AppState>,
    Extension(ctx): Extension<AuthContext>,
    Path(hash): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&ctx)?;
    let mut key = state
        .store
        .get_api_key(&hash)
        .map_err(ApiError::Internal)?
        .ok_or_else(|| ApiError::NotFound("key".into()))?;
    key.disabled = true;
    state.store.put_api_key(&key).map_err(ApiError::Internal)?;
    Ok(Json(json!({ "revoked": true })))
}

/// Per-org usage for the dashboard (admin view of any org).
pub async fn org_usage(
    State(state): State<AppState>,
    Extension(ctx): Extension<AuthContext>,
    Path(org): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&ctx)?;
    let now = Utc::now();
    let intervals = state.store.usage_for_org(&org).map_err(ApiError::Internal)?;
    let total_cost: f64 = intervals.iter().map(|iv| iv.cost_usd(now)).sum();
    let delivered: f64 = intervals.iter().map(|iv| iv.delivered_unit_seconds(now)).sum();
    let sandboxes = state.store.list_sandboxes_for_org(&org).map_err(ApiError::Internal)?;
    let active = sandboxes.iter().filter(|s| s.state.is_active()).count();
    let org_rec = state.store.get_org(&org).map_err(ApiError::Internal)?;
    Ok(Json(json!({
        "org_id": org,
        "total_cost_usd": (total_cost * 1e6).round() / 1e6,
        "delivered_unit_seconds": delivered.round(),
        "active_sandboxes": active,
        "total_sandboxes": sandboxes.len(),
        "balance_usd": org_rec.as_ref().map(|o| (o.balance_usd() * 1e6).round() / 1e6),
        "prepaid_credits_usd": org_rec.as_ref().map(|o| o.prepaid_credits_usd),
    })))
}
