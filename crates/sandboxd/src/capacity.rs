//! Capacity math and default-equivalent units (spec §9.1, §8).
//!
//! Capacity is displayed in default-equivalent units where
//! `1 unit = 1 vCPU / 2 GB / 8 GB base sandbox`. Memory is the admission
//! constraint; the practical default is intentionally below the theoretical
//! memory limit to protect against host pressure, page cache, Firecracker
//! overhead, and browser workloads.

use serde::Serialize;

/// Memory reserved for the host (kernel, page cache, Firecracker/jailer
/// overhead, host agent) and never sold to sandboxes.
pub const DEFAULT_HOST_RESERVE_GB: f64 = 12.0;
/// One default-equivalent unit's memory footprint (the base shape).
pub const UNIT_MEMORY_GB: f64 = 2.0;
/// Fraction of theoretical slots we actually admit, to absorb spikes.
/// 26 theoretical -> 20 practical on a 64 GB node ≈ 0.77.
pub const PRACTICAL_DERATE: f64 = 20.0 / 26.0;

/// Operator-tunable capacity parameters (`[capacity]` in config). The defaults
/// match spec §9.1; they were set conservatively before the shared rootfs (one
/// base image in page cache instead of N) and perpetual standby landed, so a
/// measured fleet can tighten them without a rebuild.
#[derive(Debug, Clone, Copy)]
pub struct CapacityTuning {
    pub host_reserve_gb: f64,
    pub practical_derate: f64,
}

impl Default for CapacityTuning {
    fn default() -> Self {
        CapacityTuning {
            host_reserve_gb: DEFAULT_HOST_RESERVE_GB,
            practical_derate: PRACTICAL_DERATE,
        }
    }
}

/// Installed once from config at startup. A global because capacity is derived
/// in model code (`Node::capacity`) far from any config plumbing; later set
/// calls are ignored, and the spec defaults apply when never set (tests).
static TUNING: std::sync::OnceLock<CapacityTuning> = std::sync::OnceLock::new();

pub fn set_tuning(t: CapacityTuning) {
    let _ = TUNING.set(t);
}

fn tuning() -> CapacityTuning {
    TUNING.get().copied().unwrap_or_default()
}

/// Measured host memory available for new allocations (`MemAvailable` from
/// /proc/meminfo). None off-Linux or on parse failure — callers fall back to
/// static shape-sum admission.
pub fn host_available_memory_gb() -> Option<f64> {
    let text = std::fs::read_to_string("/proc/meminfo").ok()?;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("MemAvailable:") {
            let kb: f64 = rest.trim().trim_end_matches("kB").trim().parse().ok()?;
            return Some(kb / (1024.0 * 1024.0));
        }
    }
    None
}

/// Memory PSI: the `some avg10` figure from /proc/pressure/memory — the share
/// of the last 10s in which at least one task stalled on memory. None
/// off-Linux or when PSI is unavailable.
pub fn memory_pressure_avg10() -> Option<f64> {
    let text = std::fs::read_to_string("/proc/pressure/memory").ok()?;
    let line = text.lines().find(|l| l.starts_with("some"))?;
    line.split_whitespace()
        .find_map(|tok| tok.strip_prefix("avg10="))
        .and_then(|v| v.parse().ok())
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct NodeCapacity {
    pub total_memory_gb: f64,
    pub host_reserve_gb: f64,
    pub usable_for_sandboxes_gb: f64,
    /// memory-only theoretical count of default-shape sandboxes
    pub theoretical_units: u32,
    /// derated admission ceiling in default-equivalent units
    pub practical_units: u32,
}

/// Compute node capacity from total RAM under the installed tuning. With the
/// spec defaults a 64 GB node yields usable=52, theoretical=26, practical=20
/// (spec §9.1).
pub fn node_capacity(total_memory_gb: f64) -> NodeCapacity {
    let t = tuning();
    node_capacity_with(total_memory_gb, t.host_reserve_gb, t.practical_derate)
}

/// The pure form of [`node_capacity`], explicit about its parameters.
pub fn node_capacity_with(total_memory_gb: f64, host_reserve_gb: f64, derate: f64) -> NodeCapacity {
    let usable = (total_memory_gb - host_reserve_gb).max(0.0);
    let theoretical = (usable / UNIT_MEMORY_GB).floor() as u32;
    let practical = (theoretical as f64 * derate).floor() as u32;
    NodeCapacity {
        total_memory_gb,
        host_reserve_gb,
        usable_for_sandboxes_gb: usable,
        theoretical_units: theoretical,
        practical_units: practical,
    }
}

/// How many default-equivalent units a memory footprint consumes. Used both for
/// admission and for the dashboard's "default-equivalent capacity" display.
pub fn units_for_memory_gb(memory_gb: f64) -> f64 {
    memory_gb / UNIT_MEMORY_GB
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sixty_four_gb_node_matches_spec() {
        let c = node_capacity(64.0);
        assert_eq!(c.usable_for_sandboxes_gb, 52.0);
        assert_eq!(c.theoretical_units, 26);
        assert_eq!(c.practical_units, 20);
    }

    #[test]
    fn tuned_capacity_raises_the_ceiling() {
        // A measured fleet that trims the reserve and derate admits more units
        // from the same hardware: 64 GB at 8 GB reserve / 0.9 derate → 25 units.
        let c = node_capacity_with(64.0, 8.0, 0.9);
        assert_eq!(c.usable_for_sandboxes_gb, 56.0);
        assert_eq!(c.theoretical_units, 28);
        assert_eq!(c.practical_units, 25);
    }
}
