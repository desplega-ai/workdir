//! Sandbox lifecycle state machine (spec §13.1, roadmap Phase 1).
//!
//! ```text
//! creating -> running -> stopping -> stopped  -> resuming -> running
//!                                  -> standby  -> resuming -> running
//!          -> running -> deleting -> deleted
//! creating -> failed
//! running  -> failed
//! ```
//!
//! `standby` is the perpetual-standby state (roadmap Phase 1): the idle reaper
//! snapshots a running sandbox, frees its RAM, and parks it in `standby`. It is
//! NOT active — it costs `$0` and holds no node memory — yet it auto-resumes
//! transparently on the next request, so to the user the sandbox stays alive.
//! `stopped` differs in being *user-initiated*: an explicit pause that requires
//! an explicit resume.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Creating,
    Running,
    Stopping,
    Stopped,
    /// Snapshotted + RAM freed by the idle reaper; auto-resumes on first request
    /// and bills `$0` while parked (roadmap Phase 1).
    Standby,
    Resuming,
    Deleting,
    Deleted,
    Failed,
}

impl State {
    pub fn as_str(&self) -> &'static str {
        match self {
            State::Creating => "creating",
            State::Running => "running",
            State::Stopping => "stopping",
            State::Stopped => "stopped",
            State::Standby => "standby",
            State::Resuming => "resuming",
            State::Deleting => "deleting",
            State::Deleted => "deleted",
            State::Failed => "failed",
        }
    }

    pub fn parse(s: &str) -> Option<State> {
        Some(match s {
            "creating" => State::Creating,
            "running" => State::Running,
            "stopping" => State::Stopping,
            "stopped" => State::Stopped,
            "standby" => State::Standby,
            "resuming" => State::Resuming,
            "deleting" => State::Deleting,
            "deleted" => State::Deleted,
            "failed" => State::Failed,
            _ => return None,
        })
    }

    /// Is the sandbox consuming CPU/memory on a node right now? Used by billing
    /// (per-second running compute) and by capacity admission. `standby` is
    /// explicitly NOT active: its RAM is freed and it bills `$0` (Phase 1).
    pub fn is_active(&self) -> bool {
        matches!(self, State::Creating | State::Running | State::Resuming)
    }

    /// Is the sandbox parked off-CPU but resumable (no node RAM held)? Both the
    /// user-stopped and the auto-standby states qualify.
    pub fn is_parked(&self) -> bool {
        matches!(self, State::Stopped | State::Standby)
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, State::Deleted | State::Failed)
    }

    /// Whether a transition is permitted by the state machine.
    pub fn can_transition_to(&self, next: State) -> bool {
        use State::*;
        matches!(
            (self, next),
            (Creating, Running)
                | (Creating, Failed)
                | (Running, Stopping)
                | (Running, Deleting)
                | (Running, Failed)
                | (Stopping, Stopped)
                | (Stopping, Standby) // idle reaper: snapshot + free RAM -> standby
                | (Stopped, Resuming)
                | (Stopped, Deleting)
                | (Standby, Resuming) // transparent auto-resume on next request
                | (Standby, Deleting)
                | (Standby, Failed) // restore failed
                | (Resuming, Running)
                | (Resuming, Failed)
                | (Deleting, Deleted)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::State::*;

    #[test]
    fn happy_path() {
        assert!(Creating.can_transition_to(Running));
        assert!(Running.can_transition_to(Stopping));
        assert!(Stopping.can_transition_to(Stopped));
        assert!(Stopped.can_transition_to(Resuming));
        assert!(Resuming.can_transition_to(Running));
        assert!(Running.can_transition_to(Deleting));
        assert!(Deleting.can_transition_to(Deleted));
    }

    #[test]
    fn standby_path() {
        // Idle reaper parks a running sandbox in standby and it auto-resumes.
        assert!(Stopping.can_transition_to(Standby));
        assert!(Standby.can_transition_to(Resuming));
        assert!(Standby.can_transition_to(Deleting));
        assert!(Standby.can_transition_to(Failed));
        // Standby holds no RAM and bills $0.
        assert!(!Standby.is_active());
        assert!(Standby.is_parked());
    }

    #[test]
    fn illegal_transitions_rejected() {
        assert!(!Stopped.can_transition_to(Running)); // must go via resuming
        assert!(!Deleted.can_transition_to(Running));
        assert!(!Running.can_transition_to(Stopped)); // must go via stopping
        assert!(!Standby.can_transition_to(Running)); // must go via resuming
        assert!(!Running.can_transition_to(Standby)); // must go via stopping
    }
}
