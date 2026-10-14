//! Connection pool: at most `max_live` open links, LRU eviction, per-strip coalescing,
//! one retry per strip. A strip that cannot be reached never blocks the others.

use crate::calibration::Calibration;
use crate::ids::StripId;
use crate::protocol::{Command, Profile};
use crate::transport::{Link, LinkError};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Starting estimate (Android caps near 7 concurrent links). To be measured on hardware.
pub const DEFAULT_MAX_LIVE: usize = 6;

#[derive(Clone)]
pub struct Job {
    pub strip: StripId,
    pub profile: Arc<dyn Profile>,
    pub cmd: Command,
    pub calibration: Calibration,
}

#[derive(Debug, Default, PartialEq, Eq, serde::Serialize)]
pub struct Report {
    pub ok: Vec<StripId>,
    pub unreachable: Vec<StripId>,
    /// Strips for which at least one command was skipped; a strip whose commands were all
    /// skipped is listed here and not in `ok`.
    pub unsupported: Vec<StripId>,
}

pub struct Pool<L: Link> {
    link: Arc<L>,
    max_live: usize,
    /// Front = least recently used.
    live: Mutex<VecDeque<StripId>>,
}

impl<L: Link> Pool<L> {
    pub fn new(link: Arc<L>, max_live: usize) -> Self {
        assert!(max_live > 0, "max_live must be at least 1");
        Self {
            link,
            max_live,
            live: Mutex::new(VecDeque::new()),
        }
    }

    /// Sends the jobs strip by strip. Dispatches are serialized.
    pub async fn dispatch(&self, jobs: Vec<Job>) -> Report {
        let mut report = Report::default();
        let mut live = self.live.lock().await;
        for (strip, jobs) in plan(jobs) {
            // Skip strips whose every job is inexpressible.
            if !jobs
                .iter()
                .any(|job| job.profile.encode(&job.cmd, &job.calibration).is_some())
            {
                report.unsupported.push(strip);
                continue;
            }
            match self.send_strip(&mut live, &strip, &jobs).await {
                Some(skipped) => {
                    if skipped {
                        report.unsupported.push(strip.clone());
                    }
                    report.ok.push(strip);
                }
                None => report.unreachable.push(strip),
            }
        }
        report
    }

    async fn send_strip(
        &self,
        live: &mut VecDeque<StripId>,
        strip: &StripId,
        jobs: &[Job],
    ) -> Option<bool> {
        for _attempt in 0..2 {
            if self.ensure_live(live, strip).await.is_err() {
                continue;
            }
            if let Ok(skipped) = self.write_all(strip, jobs).await {
                return Some(skipped);
            }
            // Write failed: drop the link so the next attempt reconnects from scratch.
            self.drop_live(live, strip).await;
        }
        None
    }

    async fn ensure_live(
        &self,
        live: &mut VecDeque<StripId>,
        strip: &StripId,
    ) -> Result<(), LinkError> {
        if let Some(pos) = live.iter().position(|s| s == strip) {
            let s = live.remove(pos).expect("position is in range");
            live.push_back(s);
            return Ok(());
        }
        while live.len() >= self.max_live {
            let victim = live.pop_front().expect("len >= max_live >= 1");
            // A failed disconnect means the link is already gone; nothing to recover.
            let _ = self.link.disconnect(&victim).await;
        }
        self.link.connect(strip).await?;
        live.push_back(strip.clone());
        Ok(())
    }

    /// Writes every command the profile can express. Returns whether any command was skipped.
    async fn write_all(&self, strip: &StripId, jobs: &[Job]) -> Result<bool, LinkError> {
        let mut skipped = false;
        for job in jobs {
            let Some(bytes) = job.profile.encode(&job.cmd, &job.calibration) else {
                skipped = true;
                continue;
            };
            self.link
                .write(strip, job.profile.write_characteristic(), &bytes)
                .await?;
        }
        Ok(skipped)
    }

    async fn drop_live(&self, live: &mut VecDeque<StripId>, strip: &StripId) {
        live.retain(|s| s != strip);
        let _ = self.link.disconnect(strip).await;
    }

    /// Connects `strips` ahead of the first command, up to `max_live` of them, one at a time so a real
    /// command only ever waits for the connection in progress. A strip that cannot be reached is skipped:
    /// the first command to it tries again. Returns the strips that are connected now.
    pub async fn warm(&self, strips: &[StripId]) -> Vec<StripId> {
        let mut connected = Vec::new();
        for strip in strips.iter().take(self.max_live) {
            let mut live = self.live.lock().await;
            if self.ensure_live(&mut live, strip).await.is_ok() {
                connected.push(strip.clone());
            }
        }
        connected
    }

    /// Ensures the strip is live (connecting if needed, obeying LRU) and returns its GATT services.
    /// A link the strip dropped behind our back (power cycle, out of range) shows up here as a failing
    /// call: the link is dropped and the strip reconnected once before the error is returned.
    pub async fn services(&self, strip: &StripId) -> Result<Vec<Uuid>, LinkError> {
        let mut live = self.live.lock().await;
        let mut last = None;
        for _attempt in 0..2 {
            if let Err(e) = self.ensure_live(&mut live, strip).await {
                last = Some(e);
                continue;
            }
            match self.link.services(strip).await {
                Ok(services) => return Ok(services),
                Err(e) => {
                    self.drop_live(&mut live, strip).await;
                    last = Some(e);
                }
            }
        }
        Err(last.expect("two attempts ran"))
    }
}

/// Groups jobs by strip (first-seen order). Within a strip a later command replaces an
/// earlier one of the same kind. This coalescing happens only within a single `dispatch` call;
/// separate `dispatch` calls queue on the `live` mutex and are sent in full. A caller that
/// wants coalescing across dispatch calls must batch them manually, or a future per-strip
/// pending queue in `engine`/M2 will handle it.
fn plan(jobs: Vec<Job>) -> Vec<(StripId, Vec<Job>)> {
    let mut order: Vec<StripId> = Vec::new();
    let mut by_strip: HashMap<StripId, Vec<Job>> = HashMap::new();
    for job in jobs {
        let list = by_strip.entry(job.strip.clone()).or_insert_with(|| {
            order.push(job.strip.clone());
            Vec::new()
        });
        list.retain(|j| j.cmd.kind() != job.cmd.kind());
        list.push(job);
    }
    order
        .into_iter()
        .map(|s| {
            let jobs = by_strip.remove(&s).expect("every ordered strip has jobs");
            (s, jobs)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::MrStar;
    use crate::transport::fake::FakeLink;

    fn job(strip: &str, cmd: Command) -> Job {
        Job {
            strip: StripId::new(strip),
            profile: Arc::new(MrStar),
            cmd,
            calibration: Calibration::default(),
        }
    }

    fn ids(names: &[&str]) -> Vec<StripId> {
        names.iter().map(|n| StripId::new(n)).collect()
    }

    #[tokio::test]
    async fn twelve_strips_with_six_slots_never_exceed_the_cap() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 6);
        let jobs: Vec<Job> = (0..12)
            .map(|i| job(&format!("s{i}"), Command::Power(true)))
            .collect();

        let report = pool.dispatch(jobs).await;

        assert_eq!(report.ok.len(), 12);
        assert!(report.unreachable.is_empty());
        assert_eq!(link.writes().len(), 12);
        assert!(link.peak_live() <= 6, "peak was {}", link.peak_live());
    }

    #[tokio::test]
    async fn evicts_least_recently_used_first() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 2);

        pool.dispatch(vec![
            job("A", Command::Power(true)),
            job("B", Command::Power(true)),
            job("C", Command::Power(true)),
        ])
        .await;
        // live is now [B, C]; touching A must evict B (the LRU), not C.
        pool.dispatch(vec![job("A", Command::Power(true))]).await;

        assert_eq!(link.disconnects(), ids(&["A", "B"]));
    }

    #[tokio::test]
    async fn reuses_a_live_link_without_reconnecting() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 2);

        pool.dispatch(vec![job("A", Command::Power(true))]).await;
        pool.dispatch(vec![job("A", Command::Power(false))]).await;

        assert_eq!(link.connects(), ids(&["A"]));
        assert_eq!(link.writes().len(), 2);
    }

    #[tokio::test]
    async fn keeps_only_the_last_command_of_each_kind_per_strip() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 2);

        pool.dispatch(vec![
            job("A", Command::Color { hue: 0, sat: 1000 }),
            job(
                "A",
                Command::Color {
                    hue: 120,
                    sat: 1000,
                },
            ),
            job("A", Command::Power(true)),
        ])
        .await;

        let writes: Vec<Vec<u8>> = link.writes().into_iter().map(|(_, b)| b).collect();
        assert_eq!(
            writes,
            vec![
                vec![0xBC, 0x04, 0x06, 0x00, 0x78, 0x03, 0xE8, 0x00, 0x00, 0x55],
                vec![0xBC, 0x01, 0x01, 0x01, 0x55],
            ]
        );
    }

    #[tokio::test]
    async fn unreachable_strip_does_not_block_the_others() {
        let link = Arc::new(FakeLink::default());
        link.fail_connect("B", 99);
        let pool = Pool::new(link.clone(), 3);

        let report = pool
            .dispatch(vec![
                job("A", Command::Power(true)),
                job("B", Command::Power(true)),
                job("C", Command::Power(true)),
            ])
            .await;

        assert_eq!(report.ok, ids(&["A", "C"]));
        assert_eq!(report.unreachable, ids(&["B"]));
        let b_attempts = link
            .connect_attempts()
            .into_iter()
            .filter(|s| s == &StripId::new("B"))
            .count();
        assert_eq!(b_attempts, 2, "one try plus one retry");
    }

    #[tokio::test]
    async fn retries_a_failed_connect_once() {
        let link = Arc::new(FakeLink::default());
        link.fail_connect("B", 1);
        let pool = Pool::new(link.clone(), 3);

        let report = pool.dispatch(vec![job("B", Command::Power(true))]).await;

        assert_eq!(report.ok, ids(&["B"]));
        assert_eq!(link.connect_attempts(), ids(&["B", "B"]));
    }

    #[tokio::test]
    async fn failed_write_reconnects_and_retries_once() {
        let link = Arc::new(FakeLink::default());
        link.fail_write("A", 1);
        let pool = Pool::new(link.clone(), 3);

        let report = pool.dispatch(vec![job("A", Command::Power(true))]).await;

        assert_eq!(report.ok, ids(&["A"]));
        assert_eq!(link.connects(), ids(&["A", "A"]));
        assert_eq!(link.disconnects(), ids(&["A"]));
        assert_eq!(link.writes().len(), 1);
    }

    #[tokio::test]
    async fn persistent_write_failure_marks_unreachable_with_reconnect_on_next_dispatch() {
        let link = Arc::new(FakeLink::default());
        link.fail_write("A", 99); // Persistent failure (99 retries)
        let pool = Pool::new(link.clone(), 3);

        // First dispatch: fails on write, strip marked unreachable
        let report1 = pool.dispatch(vec![job("A", Command::Power(true))]).await;
        assert_eq!(report1.unreachable, ids(&["A"]));

        // Check disconnect behavior: should have two disconnects
        // (one after initial connection, one after reconnect attempt fails)
        assert_eq!(link.disconnects(), ids(&["A", "A"]));

        // Second dispatch for A should reconnect
        let _report2 = pool.dispatch(vec![job("A", Command::Power(true))]).await;

        // Should now have a third connect attempt after the two initial ones
        assert_eq!(link.connect_attempts().len(), 4);
    }

    #[tokio::test]
    async fn commands_a_profile_cannot_express_are_skipped_and_reported() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 2);
        let xsl = crate::families::profile_by_id("xsl").unwrap();
        let mk = |cmd| Job {
            strip: StripId::new("W"),
            profile: xsl.clone(),
            cmd,
            calibration: Calibration::default(),
        };

        // XSL is a white-only strip: power is expressible, colour is not.
        let report = pool
            .dispatch(vec![
                mk(Command::Color { hue: 0, sat: 1000 }),
                mk(Command::Power(true)),
            ])
            .await;

        assert_eq!(report.ok, ids(&["W"]));
        assert_eq!(report.unsupported, ids(&["W"]));
        assert!(report.unreachable.is_empty());
        assert_eq!(link.writes().len(), 1, "only the power frame is written");
    }

    #[tokio::test]
    async fn a_strip_whose_commands_are_all_inexpressible_is_not_connected() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 2);
        let xsl = crate::families::profile_by_id("xsl").unwrap();
        let mk = |cmd| Job {
            strip: StripId::new("W"),
            profile: xsl.clone(),
            cmd,
            calibration: Calibration::default(),
        };

        // XSL is a white-only strip: colour commands cannot be expressed.
        let report = pool
            .dispatch(vec![
                mk(Command::Color { hue: 0, sat: 1000 }),
                mk(Command::Color { hue: 120, sat: 500 }),
            ])
            .await;

        assert!(link.connect_attempts().is_empty(), "should not connect");
        assert!(report.ok.is_empty(), "should not be in ok");
        assert_eq!(
            report.unsupported,
            ids(&["W"]),
            "should be in unsupported only"
        );
        assert!(report.unreachable.is_empty());
    }

    #[tokio::test]
    async fn services_leaves_the_link_live_and_counts_against_the_cap() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 1);

        pool.services(&StripId::new("A")).await.unwrap();
        assert_eq!(link.connects(), ids(&["A"]));

        // Calling services on B should evict A from the live list.
        pool.services(&StripId::new("B")).await.unwrap();
        assert_eq!(link.connects(), ids(&["A", "B"]));
        assert_eq!(link.disconnects(), ids(&["A"]));
    }

    #[tokio::test]
    async fn services_reconnects_once_when_the_link_was_dropped_behind_our_back() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 2);
        pool.services(&StripId::new("A")).await.unwrap();
        link.fail_services("A", 1); // the strip was power-cycled: the cached link is dead

        let services = pool.services(&StripId::new("A")).await;

        assert!(services.is_ok());
        assert_eq!(
            link.connects(),
            ids(&["A", "A"]),
            "reconnected from scratch"
        );
        assert_eq!(
            link.disconnects(),
            ids(&["A"]),
            "the dead link was dropped first"
        );
    }

    #[tokio::test]
    async fn services_gives_up_after_one_reconnect() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 2);
        link.fail_services("A", 2);

        assert!(pool.services(&StripId::new("A")).await.is_err());
        assert_eq!(
            link.disconnects(),
            ids(&["A", "A"]),
            "every dead link was dropped, none left half-live"
        );
    }

    #[tokio::test]
    async fn warming_connects_up_to_the_cap_and_skips_unreachable_strips() {
        let link = Arc::new(FakeLink::default());
        link.fail_connect("B", 2);
        let pool = Pool::new(link.clone(), 2);

        let connected = pool.warm(&ids(&["A", "B", "C"])).await;

        // the cap counts strips tried, not strips that connected: B failed, C was beyond the cap
        assert_eq!(connected, ids(&["A"]));
        assert_eq!(link.connects(), ids(&["A"]));
        assert_eq!(link.connect_attempts(), ids(&["A", "B"]));
    }

    #[tokio::test]
    async fn a_command_to_a_warmed_strip_does_not_connect_again() {
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 6);
        pool.warm(&ids(&["A"])).await;

        let report = pool.dispatch(vec![job("A", Command::Power(true))]).await;

        assert_eq!(report.ok, ids(&["A"]));
        assert_eq!(link.connects(), ids(&["A"]));
    }
}
