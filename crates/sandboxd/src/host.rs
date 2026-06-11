//! Host-level metrics, read from `/proc` on Linux (where the data plane runs).
//! On other platforms most fields are best-effort/zero — the dev runtime never
//! needs them.

use serde::Serialize;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Default, Serialize)]
pub struct HostMetrics {
    pub hostname: String,
    pub uptime_seconds: u64,
    pub cpu_count: usize,
    pub load1: f64,
    pub load5: f64,
    pub load15: f64,
    pub cpu_percent: f64,
    pub mem_total_mb: u64,
    pub mem_available_mb: u64,
    pub mem_used_mb: u64,
    pub disk_total_gb: f64,
    pub disk_free_gb: f64,
    pub disk_used_gb: f64,
    /// Live Firecracker processes on this host.
    pub firecracker_procs: u64,
}

pub async fn collect(data_dir: &Path) -> HostMetrics {
    let mut m = HostMetrics {
        cpu_count: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0),
        hostname: read_line("/proc/sys/kernel/hostname").unwrap_or_else(|| "unknown".into()),
        firecracker_procs: count_procs("firecracker"),
        ..Default::default()
    };

    if let Some(up) = read_line("/proc/uptime")
        .and_then(|s| s.split_whitespace().next().and_then(|v| v.parse::<f64>().ok()))
    {
        m.uptime_seconds = up as u64;
    }

    if let Some(s) = read_line("/proc/loadavg") {
        let p: Vec<f64> = s.split_whitespace().take(3).filter_map(|v| v.parse().ok()).collect();
        if p.len() == 3 {
            m.load1 = p[0];
            m.load5 = p[1];
            m.load15 = p[2];
        }
    }

    if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
        let kb = |key: &str| -> u64 {
            meminfo
                .lines()
                .find(|l| l.starts_with(key))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0)
        };
        let total = kb("MemTotal:");
        let avail = kb("MemAvailable:");
        m.mem_total_mb = total / 1024;
        m.mem_available_mb = avail / 1024;
        m.mem_used_mb = total.saturating_sub(avail) / 1024;
    }

    m.cpu_percent = cpu_percent().await;

    if let Some((total, free)) = df_bytes(data_dir).await {
        m.disk_total_gb = round2(total as f64 / 1e9);
        m.disk_free_gb = round2(free as f64 / 1e9);
        m.disk_used_gb = round2(total.saturating_sub(free) as f64 / 1e9);
    }

    m
}

fn read_line(path: &str) -> Option<String> {
    std::fs::read_to_string(path).ok().map(|s| s.lines().next().unwrap_or("").trim().to_string())
}

/// Count running processes whose comm matches `name` (Linux /proc scan).
fn count_procs(name: &str) -> u64 {
    let mut n = 0;
    if let Ok(entries) = std::fs::read_dir("/proc") {
        for e in entries.flatten() {
            let fname = e.file_name();
            if !fname.to_string_lossy().chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            if let Ok(comm) = std::fs::read_to_string(e.path().join("comm")) {
                if comm.trim() == name {
                    n += 1;
                }
            }
        }
    }
    n
}

/// CPU busy percent across all cores, from two `/proc/stat` samples.
async fn cpu_percent() -> f64 {
    fn sample() -> Option<(u64, u64)> {
        let s = std::fs::read_to_string("/proc/stat").ok()?;
        let line = s.lines().next()?; // "cpu  user nice system idle iowait irq softirq steal..."
        let vals: Vec<u64> = line.split_whitespace().skip(1).filter_map(|v| v.parse().ok()).collect();
        if vals.len() < 4 {
            return None;
        }
        let idle = vals[3] + vals.get(4).copied().unwrap_or(0); // idle + iowait
        let total: u64 = vals.iter().sum();
        Some((total, idle))
    }
    let a = sample();
    tokio::time::sleep(Duration::from_millis(200)).await;
    let b = sample();
    if let (Some((t0, i0)), Some((t1, i1))) = (a, b) {
        let dt = t1.saturating_sub(t0) as f64;
        let di = i1.saturating_sub(i0) as f64;
        if dt > 0.0 {
            return round2((1.0 - di / dt) * 100.0);
        }
    }
    0.0
}

/// (total_bytes, free_bytes) for the filesystem holding `dir`, via `df`.
async fn df_bytes(dir: &Path) -> Option<(u64, u64)> {
    let out = tokio::process::Command::new("df").arg("-kP").arg(dir).output().await.ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let cols: Vec<&str> = text.lines().nth(1)?.split_whitespace().collect();
    // Filesystem 1024-blocks Used Available Capacity Mounted-on
    let total_kb: u64 = cols.get(1)?.parse().ok()?;
    let avail_kb: u64 = cols.get(3)?.parse().ok()?;
    Some((total_kb * 1024, avail_kb * 1024))
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
