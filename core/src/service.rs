//! The application service: one object that owns the link, the connection pool, the registry
//! and the setup-wizard session. The Tauri layer is a thin wrapper over these methods and
//! every behaviour here is tested against `FakeLink`, with no Bluetooth.

use crate::calibration::{Calibration, Capabilities, ChannelOrder};
use crate::families::all_profiles;
use crate::ids::{GroupId, StripId};
use crate::pool::{Job, Pool, Report, DEFAULT_MAX_LIVE};
use crate::protocol::{Command, Profile};
use crate::registry::{Group, Registry, RegistryError, Strip, Target};
use crate::setup::{
    analyze_intensity, deduce_channel_order, IntensityAnswer, IntensityResult, Outcome, Recognizer,
    Seen, SetupError, SetupResult, INTENSITY_LEVELS,
};
use crate::transport::{Discovered, Link, LinkError, Scanner};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error("no setup wizard session is active")]
    NoSession,
    #[error("the strip has not been recognized yet")]
    NotRecognized,
    #[error("the recognizer has no probe to send")]
    NothingToProbe,
    #[error(
        "the three colour answers do not describe a valid channel order; repeat the colour test"
    )]
    BadColourAnswers,
    #[error("colour test index must be 0, 1 or 2")]
    BadColourIndex,
    #[error("intensity level index must be 0..=5")]
    BadLevelIndex,
    #[error(transparent)]
    Setup(#[from] SetupError),
    #[error(transparent)]
    Link(#[from] LinkError),
    #[error(transparent)]
    Registry(#[from] RegistryError),
    #[error("saving the registry failed: {0}")]
    Save(String),
    #[error("service unavailable: {0}")]
    Unavailable(String),
    #[error("group {0:?} already exists")]
    GroupExists(GroupId),
}

/// Errors cross the Tauri boundary as plain strings.
impl Serialize for ServiceError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Which question the user is being asked about the current candidate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProbePhase {
    /// "Did it go off and back on?"
    Blink,
    /// "Which solid colour do you see?"
    Colour,
}

/// The probe the wizard wants the user to see next.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProbeView {
    /// 1-based candidate number and total, for "Testing family N of M".
    pub index: usize,
    pub total: usize,
    pub profile_id: String,
    pub phase: ProbePhase,
    pub commands: Vec<Command>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum WizardState {
    Probing {
        probe: ProbeView,
    },
    Recognized {
        profile_id: String,
        capabilities: Capabilities,
    },
    Exhausted,
}

/// One entry of the protocol catalogue, for the "supported strip types" screen.
#[derive(Debug, Clone, Serialize)]
pub struct ProfileInfo {
    pub id: String,
    pub capabilities: Capabilities,
    /// Confirmed on a real strip. Only `mrstar` is, so far.
    pub verified: bool,
}

/// Every profile the wizard can recognize.
pub fn profile_catalogue() -> Vec<ProfileInfo> {
    all_profiles()
        .into_iter()
        .map(|p| ProfileInfo {
            id: p.id().to_string(),
            capabilities: p.capabilities(),
            verified: p.id() == "mrstar",
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub strips: Vec<Strip>,
    pub groups: Vec<Group>,
}

struct Session {
    strip: StripId,
    recognizer: Recognizer,
    recognized: Option<Arc<dyn Profile>>,
    /// The intensity test left the strip at a low brightness; leaving the wizard puts it back to full.
    dimmed: bool,
}

fn probe_view(recognizer: &Recognizer) -> Option<ProbeView> {
    let (profile, commands) = recognizer.commands()?;
    let (index, total) = recognizer.progress();
    // Both phases start with Power(true) or Power(false), so the phase is told by the colour command.
    let phase = if commands.iter().any(|c| matches!(c, Command::Color { .. })) {
        ProbePhase::Colour
    } else {
        ProbePhase::Blink
    };
    Some(ProbeView {
        index,
        total,
        profile_id: profile.id().to_string(),
        phase,
        commands,
    })
}

/// Protocol value of 100 % brightness.
const FULL_BRIGHTNESS: u16 = 1000;

pub struct Service<L: Link + Scanner> {
    link: Arc<L>,
    pool: Pool<L>,
    registry: Mutex<Registry>,
    registry_path: PathBuf,
    session: Mutex<Option<Session>>,
    /// Pause after a power-off inside a probe, so the user can see the strip go dark.
    blink_delay: Duration,
}

/// Merges a new report into the accumulated report with exclusive unreachable handling.
/// If the strip is unreachable in next, it is removed from into and kept only in unreachable.
fn merge_reports(into: &mut Report, next: Report, strip: &StripId) {
    if next.unreachable.contains(strip) {
        into.ok.retain(|id| id != strip);
        into.unsupported.retain(|id| id != strip);
        into.unreachable.push(strip.clone());
        return;
    }

    for id in next.ok {
        if !into.ok.contains(&id) {
            into.ok.push(id);
        }
    }
    for id in next.unsupported {
        if !into.unsupported.contains(&id) {
            into.unsupported.push(id);
        }
    }
}

/// A free `<file name>.corrupt-<unix-seconds>[-N]` path next to `path`; never an existing file.
fn quarantine_path(path: &Path) -> PathBuf {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "registry.json".to_string());
    let dir = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let first = dir.join(format!("{name}.corrupt-{secs}"));
    if !first.exists() {
        return first;
    }
    (1..)
        .map(|n| dir.join(format!("{name}.corrupt-{secs}-{n}")))
        .find(|p| !p.exists())
        .expect("an unused name exists")
}

impl<L: Link + Scanner> Service<L> {
    /// Loads the registry from `registry_path` when the file exists. If the file is corrupt,
    /// renames it to `<name>.corrupt-<unix-seconds>` and starts empty.
    pub fn new(link: Arc<L>, registry_path: PathBuf) -> std::io::Result<Self> {
        let registry = if registry_path.exists() {
            match Registry::load(&registry_path) {
                Ok(r) => r,
                // Only a file that was read but is not valid JSON is moved aside. Any other failure (permissions,
                // a directory in the way, a transient read error) is returned and the file is left alone.
                Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
                    let quarantine = quarantine_path(&registry_path);
                    std::fs::rename(&registry_path, &quarantine)?;
                    eprintln!("Corrupt registry file moved to {}", quarantine.display());
                    Registry::default()
                }
                Err(e) => return Err(e),
            }
        } else {
            Registry::default()
        };
        Ok(Self {
            pool: Pool::new(link.clone(), DEFAULT_MAX_LIVE),
            link,
            registry: Mutex::new(registry),
            registry_path,
            session: Mutex::new(None),
            blink_delay: Duration::from_millis(1200),
        })
    }

    /// Overrides the pause after a power-off inside a probe (tests use zero).
    pub fn with_blink_delay(mut self, delay: Duration) -> Self {
        self.blink_delay = delay;
        self
    }

    pub async fn snapshot(&self) -> Snapshot {
        let r = self.registry.lock().await;
        Snapshot {
            strips: r.strips().cloned().collect(),
            groups: r.groups().cloned().collect(),
        }
    }

    /// Connects the saved strips (as many as the pool keeps open) in the background of app start, so the
    /// first colour or effect does not wait for a scan and a connection. Best effort; returns the strips
    /// that are connected afterwards.
    pub async fn warm_up(&self) -> Vec<StripId> {
        let ids: Vec<StripId> = {
            let r = self.registry.lock().await;
            r.strips()
                .map(|s| s.id.clone())
                .take(DEFAULT_MAX_LIVE)
                .collect()
        };
        if ids.is_empty() {
            return ids;
        }
        self.link.prepare(&ids).await;
        self.pool.warm(&ids).await
    }

    /// Whether Bluetooth is switched on; `None` when the platform cannot tell.
    pub async fn bluetooth_on(&self) -> Option<bool> {
        self.link.powered().await
    }

    pub async fn scan(&self, secs: u64) -> Result<Vec<Discovered>, ServiceError> {
        Ok(self.link.scan(Duration::from_secs(secs)).await?)
    }

    /// Sends `command` to every strip the targets resolve to.
    pub async fn apply(
        &self,
        targets: &[Target],
        command: Command,
    ) -> Result<Report, ServiceError> {
        let jobs = {
            let registry = self.registry.lock().await;
            registry.jobs(targets, command)?
        };
        Ok(self.pool.dispatch(jobs).await)
    }

    // ------------------------------------------------------------ groups

    /// Applies `f` to a copy of the registry under ONE guard, saves the copy, then swaps it in:
    /// a failed save leaves memory and disk as they were, and two mutations cannot overwrite
    /// each other.
    async fn mutate(
        &self,
        f: impl FnOnce(&mut Registry) -> Result<(), ServiceError>,
    ) -> Result<(), ServiceError> {
        let mut r = self.registry.lock().await;
        let mut next = (*r).clone();
        f(&mut next)?;
        self.save(&next)?;
        *r = next;
        Ok(())
    }

    pub async fn create_group(&self, id: GroupId, name: &str) -> Result<(), ServiceError> {
        self.mutate(|r| {
            if r.group(&id).is_some() {
                return Err(ServiceError::GroupExists(id));
            }
            r.add_group(id, name);
            Ok(())
        })
        .await
    }

    pub async fn add_to_group(&self, group: &GroupId, strip: &StripId) -> Result<(), ServiceError> {
        self.mutate(|r| Ok(r.add_member(group, strip)?)).await
    }

    pub async fn remove_from_group(
        &self,
        group: &GroupId,
        strip: &StripId,
    ) -> Result<(), ServiceError> {
        self.mutate(|r| Ok(r.remove_member(group, strip)?)).await
    }

    pub async fn reorder_group(
        &self,
        group: &GroupId,
        order: &[StripId],
    ) -> Result<(), ServiceError> {
        self.mutate(|r| Ok(r.set_members(group, order)?)).await
    }

    pub async fn rename_group(&self, group: &GroupId, name: &str) -> Result<(), ServiceError> {
        self.mutate(|r| Ok(r.rename_group(group, name)?)).await
    }

    pub async fn delete_group(&self, group: &GroupId) -> Result<(), ServiceError> {
        self.mutate(|r| Ok(r.remove_group(group)?)).await
    }

    pub async fn set_channel_order(
        &self,
        strip: &StripId,
        order: ChannelOrder,
    ) -> Result<(), ServiceError> {
        self.mutate(|r| Ok(r.set_channel_order(strip, order)?))
            .await
    }

    pub async fn rename_strip(&self, strip: &StripId, name: &str) -> Result<(), ServiceError> {
        self.mutate(|r| Ok(r.rename_strip(strip, name)?)).await
    }

    pub async fn remove_strip(&self, id: &StripId) -> Result<(), ServiceError> {
        self.mutate(|r| {
            r.remove_strip(id);
            Ok(())
        })
        .await
    }

    fn save(&self, registry: &Registry) -> Result<(), ServiceError> {
        registry
            .save(&self.registry_path)
            .map_err(|e| ServiceError::Save(e.to_string()))
    }

    // ------------------------------------------------------------ setup wizard

    /// Steps 2-3. Uses the pool to connect once and read the strip's GATT services (they rank
    /// the candidate profiles). Any existing session is discarded before the strip is contacted,
    /// even if the start then fails.
    pub async fn wizard_start(
        &self,
        strip: StripId,
        advertised_name: Option<String>,
    ) -> Result<WizardState, ServiceError> {
        *self.session.lock().await = None;
        let services = self.pool.services(&strip).await?;
        let recognizer = Recognizer::new(advertised_name.as_deref(), &services);
        let probe = probe_view(&recognizer).ok_or(ServiceError::NothingToProbe)?;
        *self.session.lock().await = Some(Session {
            strip,
            recognizer,
            recognized: None,
            dimmed: false,
        });
        Ok(WizardState::Probing { probe })
    }

    /// Sends the current candidate's probe commands to the strip being set up.
    pub async fn wizard_probe(&self) -> Result<Report, ServiceError> {
        let (strip, profile, commands) = {
            let guard = self.session.lock().await;
            let session = guard.as_ref().ok_or(ServiceError::NoSession)?;
            let (profile, commands) = session
                .recognizer
                .commands()
                .ok_or(ServiceError::NothingToProbe)?;
            (session.strip.clone(), profile, commands)
        };
        Ok(self
            .send_jobs(&strip, profile, &commands, Calibration::default())
            .await)
    }

    pub async fn wizard_answer_power(
        &self,
        turned_off_and_on: bool,
    ) -> Result<WizardState, ServiceError> {
        self.answer(|r| r.answer_power(turned_off_and_on)).await
    }

    pub async fn wizard_answer_colour(&self, seen: Seen) -> Result<WizardState, ServiceError> {
        self.answer(|r| r.answer_colour(seen)).await
    }

    async fn answer(
        &self,
        f: impl FnOnce(&mut Recognizer) -> Outcome,
    ) -> Result<WizardState, ServiceError> {
        let mut guard = self.session.lock().await;
        let session = guard.as_mut().ok_or(ServiceError::NoSession)?;
        match f(&mut session.recognizer) {
            Outcome::Continue => Ok(WizardState::Probing {
                probe: probe_view(&session.recognizer).ok_or(ServiceError::NothingToProbe)?,
            }),
            Outcome::Recognized(profile) => {
                let state = WizardState::Recognized {
                    profile_id: profile.id().to_string(),
                    capabilities: profile.capabilities(),
                };
                session.recognized = Some(profile);
                Ok(state)
            }
            Outcome::Exhausted => Ok(WizardState::Exhausted),
        }
    }

    /// Starts a session for a strip that is already saved, skipping recognition (its profile is
    /// known), so the colour, intensity and summary steps can be redone. Finishing the session
    /// replaces the saved strip with the same id.
    pub async fn wizard_recalibrate(&self, strip: StripId) -> Result<WizardState, ServiceError> {
        let profile_id = {
            let r = self.registry.lock().await;
            r.strip(&strip)
                .ok_or_else(|| RegistryError::UnknownStrip(strip.clone()))?
                .profile
                .clone()
        };
        let profile = crate::families::profile_by_id(&profile_id)
            .ok_or(RegistryError::UnknownProfile(profile_id))?;
        let state = WizardState::Recognized {
            profile_id: profile.id().to_string(),
            capabilities: profile.capabilities(),
        };
        *self.session.lock().await = Some(Session {
            strip,
            recognizer: Recognizer::new(None, &[]),
            recognized: Some(profile),
            dimmed: false,
        });
        Ok(state)
    }

    /// Step 4. Turns the recognized strip off and back on, with a visible pause in between.
    pub async fn wizard_power_test(&self) -> Result<Report, ServiceError> {
        self.send_recognized(&[Command::Power(false), Command::Power(true)])
            .await
    }

    /// Step 5. Shows one pure primary (0 = red, 1 = green, 2 = blue) with the neutral channel order.
    pub async fn wizard_colour_test(&self, index: usize) -> Result<Report, ServiceError> {
        let hue = *[0u16, 120, 240]
            .get(index)
            .ok_or(ServiceError::BadColourIndex)?;
        self.send_recognized(&[Command::Power(true), Command::Color { hue, sat: 1000 }])
            .await
    }

    /// Step 7. Shows white at `INTENSITY_LEVELS[level]`.
    pub async fn wizard_intensity_test(&self, level: usize) -> Result<Report, ServiceError> {
        let value = *INTENSITY_LEVELS
            .get(level)
            .ok_or(ServiceError::BadLevelIndex)?;
        let report = self
            .send_recognized(&[
                Command::Power(true),
                Command::Color { hue: 0, sat: 0 },
                Command::Brightness(value),
            ])
            .await?;
        if value < FULL_BRIGHTNESS {
            if let Some(session) = self.session.lock().await.as_mut() {
                session.dimmed = true;
            }
        } else if let Some(session) = self.session.lock().await.as_mut() {
            session.dimmed = false;
        }
        Ok(report)
    }

    /// The strip keeps the brightness the intensity test left it at (3 % looks switched off), so leaving the
    /// wizard puts it back to full. Best effort: the strip may be gone already.
    async fn restore_brightness(&self, session: &Session) {
        if !session.dimmed {
            return;
        }
        if let Some(profile) = session.recognized.clone() {
            let _ = self
                .send_jobs(
                    &session.strip,
                    profile,
                    &[Command::Brightness(FULL_BRIGHTNESS)],
                    Calibration::default(),
                )
                .await;
        }
    }

    async fn send_recognized(&self, commands: &[Command]) -> Result<Report, ServiceError> {
        let (strip, profile) = {
            let guard = self.session.lock().await;
            let session = guard.as_ref().ok_or(ServiceError::NoSession)?;
            let profile = session
                .recognized
                .clone()
                .ok_or(ServiceError::NotRecognized)?;
            (session.strip.clone(), profile)
        };
        Ok(self
            .send_jobs(&strip, profile, commands, Calibration::default())
            .await)
    }

    /// Sends the commands one `dispatch` at a time. They must not share a dispatch: the pool keeps
    /// only the last command of each kind per strip, so `[Power(false), Power(true)]` in one
    /// dispatch would send only the power-on and the strip would never blink. The returned report
    /// merges the per-command reports with exclusive unreachable handling: once unreachable, no further
    /// commands are dispatched. A strip that becomes unreachable stops all further dispatches.
    async fn send_jobs(
        &self,
        strip: &StripId,
        profile: Arc<dyn Profile>,
        commands: &[Command],
        calibration: Calibration,
    ) -> Report {
        let mut merged = Report::default();
        for (i, cmd) in commands.iter().enumerate() {
            let report = self
                .pool
                .dispatch(vec![Job {
                    strip: strip.clone(),
                    profile: profile.clone(),
                    cmd: *cmd,
                    calibration,
                }])
                .await;

            merge_reports(&mut merged, report, strip);

            if merged.unreachable.contains(strip) {
                break;
            }

            let more = i + 1 < commands.len();
            if more && matches!(cmd, Command::Power(false)) {
                tokio::time::sleep(self.blink_delay).await;
            }
        }
        merged
    }

    /// Step 9. `colours` = what the user saw for the red, green and blue tests; `intensity` = the
    /// six answers of step 7. `None` means "not measured": neutral order, default minimum, 0 steps.
    /// On a bad answer the session is kept so the caller can redo the step.
    pub async fn wizard_finish(
        &self,
        name: &str,
        colours: Option<[Seen; 3]>,
        has_white: bool,
        intensity: Option<Vec<IntensityAnswer>>,
    ) -> Result<Strip, ServiceError> {
        let mut guard = self.session.lock().await;
        let (strip_id, profile) = {
            let session = guard.as_ref().ok_or(ServiceError::NoSession)?;
            self.restore_brightness(session).await;
            let profile = session
                .recognized
                .clone()
                .ok_or(ServiceError::NotRecognized)?;
            (session.strip.clone(), profile)
        };
        let order = match colours {
            Some(seen) => deduce_channel_order(seen).ok_or(ServiceError::BadColourAnswers)?,
            None => ChannelOrder::default(),
        };
        let measured = match intensity {
            Some(answers) => analyze_intensity(&answers)?,
            None => IntensityResult {
                min_brightness: Calibration::default().min_brightness,
                steps: 0,
            },
        };
        let result = SetupResult::new(profile.as_ref(), order, has_white, measured);
        let strip = Strip::from_setup(strip_id, name, &result);
        {
            let mut registry = self.registry.lock().await;
            let mut next = registry.clone();
            next.add_strip(strip.clone());
            self.save(&next)?;
            *registry = next;
        }
        *guard = None;
        Ok(strip)
    }

    /// Drops the current wizard session (the user left the wizard).
    pub async fn wizard_cancel(&self) {
        let session = self.session.lock().await.take();
        if let Some(session) = session {
            self.restore_brightness(&session).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transport::fake::FakeLink;
    use uuid::Uuid;

    const STRIP: &str = "AA-BB";

    fn service() -> (Service<FakeLink>, Arc<FakeLink>, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let link = Arc::new(FakeLink::default());
        let svc = Service::new(link.clone(), dir.path().join("registry.json"))
            .unwrap()
            .with_blink_delay(Duration::ZERO);
        (svc, link, dir)
    }

    fn bytes(link: &FakeLink) -> Vec<Vec<u8>> {
        link.writes().into_iter().map(|(_, b)| b).collect()
    }

    fn all_lit() -> Vec<IntensityAnswer> {
        [true, true, true, true, false, false]
            .iter()
            .map(|d| IntensityAnswer {
                lit: true,
                differs: *d,
            })
            .collect()
    }

    /// Runs the whole wizard for an MR Star strip and saves it.
    async fn add_mrstar(svc: &Service<FakeLink>, id: &str, name: &str) {
        svc.wizard_start(StripId::new(id), Some("GATT--DEMO".into()))
            .await
            .unwrap();
        svc.wizard_answer_power(true).await.unwrap();
        svc.wizard_answer_colour(Seen::Red).await.unwrap();
        svc.wizard_finish(name, None, false, None).await.unwrap();
    }

    #[test]
    fn command_and_target_have_the_json_shape_the_ui_sends() {
        let power: Command = serde_json::from_str(r#"{"type":"power","value":true}"#).unwrap();
        assert_eq!(power, Command::Power(true));
        let colour: Command =
            serde_json::from_str(r#"{"type":"color","value":{"hue":120,"sat":1000}}"#).unwrap();
        assert_eq!(
            colour,
            Command::Color {
                hue: 120,
                sat: 1000
            }
        );
        let brightness: Command =
            serde_json::from_str(r#"{"type":"brightness","value":500}"#).unwrap();
        assert_eq!(brightness, Command::Brightness(500));
        let target: Target = serde_json::from_str(r#"{"type":"group","id":"living-room"}"#).unwrap();
        let effect: Command = serde_json::from_str(r#"{"type":"effect","value":35}"#).unwrap();
        assert_eq!(effect, Command::Effect(35));
        let speed: Command = serde_json::from_str(r#"{"type":"speed","value":50}"#).unwrap();
        assert_eq!(speed, Command::Speed(50));
        let direction: Command =
            serde_json::from_str(r#"{"type":"direction","value":true}"#).unwrap();
        assert_eq!(direction, Command::Direction(true));
        assert_eq!(target, Target::Group(GroupId::new("living-room")));
        let seen: Seen = serde_json::from_str(r#""green""#).unwrap();
        assert_eq!(seen, Seen::Green);
    }

    #[tokio::test]
    async fn scan_returns_what_the_scanner_sees() {
        let (svc, link, _dir) = service();
        link.set_discovered(vec![Discovered {
            id: StripId::new(STRIP),
            name: Some("GATT--DEMO".into()),
            rssi: Some(-60),
            services: vec![],
        }]);
        let found = svc.scan(1).await.unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name.as_deref(), Some("GATT--DEMO"));
    }

    #[tokio::test]
    async fn the_wizard_recognizes_calibrates_and_saves_a_strip() {
        let (svc, link, dir) = service();

        let state = svc
            .wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await
            .unwrap();
        let WizardState::Probing { probe } = state else {
            panic!("expected a probe")
        };
        assert_eq!(probe.profile_id, "mrstar");
        assert_eq!(probe.phase, ProbePhase::Blink);
        assert_eq!(
            probe.commands,
            vec![Command::Power(false), Command::Power(true)]
        );

        // the probe really goes out as MR Star frames
        let report = svc.wizard_probe().await.unwrap();
        assert_eq!(report.ok, vec![StripId::new(STRIP)]);
        assert_eq!(
            bytes(&link),
            vec![
                vec![0xBC, 0x01, 0x01, 0x00, 0x55],
                vec![0xBC, 0x01, 0x01, 0x01, 0x55]
            ]
        );

        // blink confirmed, now the colour phase
        let WizardState::Probing { probe } = svc.wizard_answer_power(true).await.unwrap() else {
            panic!("expected the colour probe")
        };
        assert_eq!(probe.phase, ProbePhase::Colour);
        assert_eq!(
            probe.commands,
            vec![Command::Power(true), Command::Color { hue: 0, sat: 1000 }]
        );
        let recognized = svc.wizard_answer_colour(Seen::Red).await.unwrap();
        assert_eq!(
            recognized,
            WizardState::Recognized {
                profile_id: "mrstar".into(),
                capabilities: Capabilities {
                    color: true,
                    brightness: true,
                    effects: true,
                    ..Capabilities::default()
                },
            }
        );

        // step 5 and 7 tests send real frames through the recognized profile
        svc.wizard_colour_test(1).await.unwrap();
        svc.wizard_intensity_test(5).await.unwrap();
        let sent = bytes(&link);
        assert!(sent.contains(&vec![
            0xBC, 0x04, 0x06, 0x00, 0x78, 0x03, 0xE8, 0x00, 0x00, 0x55
        ]));
        assert_eq!(
            sent.last().unwrap(),
            &vec![0xBC, 0x05, 0x06, 0x00, 0x1E, 0x00, 0x00, 0x00, 0x00, 0x55]
        );

        let strip = svc
            .wizard_finish(
                "Living Room TV",
                Some([Seen::Red, Seen::Green, Seen::Blue]),
                false,
                Some(all_lit()),
            )
            .await
            .unwrap();
        assert_eq!(strip.profile, "mrstar");
        assert_eq!(strip.calibration.min_brightness, 30);
        assert_eq!(strip.calibration.steps, 4);

        let snap = svc.snapshot().await;
        assert_eq!(snap.strips.len(), 1);
        assert_eq!(snap.strips[0].name, "Living Room TV");
        let on_disk = Registry::load(&dir.path().join("registry.json")).unwrap();
        assert_eq!(on_disk.strip(&StripId::new(STRIP)), Some(&strip));
        assert!(matches!(
            svc.wizard_probe().await,
            Err(ServiceError::NoSession)
        ));
    }

    #[tokio::test]
    async fn a_probe_with_two_power_commands_sends_both() {
        // Regression: one dispatch would have coalesced them into just the power-on.
        let (svc, link, _dir) = service();
        svc.wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await
            .unwrap();
        svc.wizard_probe().await.unwrap();
        assert_eq!(bytes(&link).len(), 2);
    }

    #[tokio::test]
    async fn a_strip_that_cannot_be_connected_does_not_open_a_session() {
        let (svc, link, _dir) = service();
        link.fail_connect(STRIP, 2); // the pool tries twice before giving up

        let first = svc
            .wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await;

        assert!(matches!(first, Err(ServiceError::Link(_))));
        assert!(matches!(
            svc.wizard_probe().await,
            Err(ServiceError::NoSession)
        ));
        // the failure was transient: starting again works
        assert!(svc
            .wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn a_failed_start_clears_the_previous_session() {
        let (svc, link, _dir) = service();
        svc.wizard_start(StripId::new("A"), Some("GATT--DEMO".into()))
            .await
            .unwrap();
        link.fail_connect("B", 2); // the pool tries twice before giving up

        let failed = svc
            .wizard_start(StripId::new("B"), Some("GATT--DEMO".into()))
            .await;

        assert!(matches!(failed, Err(ServiceError::Link(_))));
        assert!(matches!(
            svc.wizard_probe().await,
            Err(ServiceError::NoSession)
        ));
    }

    #[tokio::test]
    async fn restarting_the_wizard_on_the_same_strip_reuses_the_live_link() {
        let (svc, link, _dir) = service();
        for _ in 0..2 {
            svc.wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
                .await
                .unwrap();
            let report = svc.wizard_probe().await.unwrap();
            assert_eq!(report.ok, vec![StripId::new(STRIP)]);
        }

        assert_eq!(link.connects(), vec![StripId::new(STRIP)]);
        assert_eq!(link.writes().len(), 4, "both probes wrote both frames");
    }

    #[tokio::test]
    async fn an_unreachable_strip_stops_the_probe_after_the_first_command() {
        let (svc, link, _dir) = service();
        svc.wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await
            .unwrap();
        link.fail_write(STRIP, 99);

        let report = svc.wizard_probe().await.unwrap();

        assert_eq!(report.unreachable, vec![StripId::new(STRIP)]);
        assert!(report.ok.is_empty());
        // The connect of `wizard_start` plus the pool's single reconnect; the second probe
        // command must not be dispatched.
        assert_eq!(link.connect_attempts().len(), 2);
    }

    #[tokio::test]
    async fn a_rejected_candidate_moves_to_the_next_profile() {
        let (svc, _link, _dir) = service();
        svc.wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await
            .unwrap();
        let WizardState::Probing { probe } = svc.wizard_answer_power(false).await.unwrap() else {
            panic!("expected the next probe")
        };
        assert_ne!(probe.profile_id, "mrstar");
        assert_eq!(probe.index, 2);
    }

    #[tokio::test]
    async fn answering_no_to_every_candidate_ends_exhausted() {
        let (svc, _link, _dir) = service();
        let WizardState::Probing { probe } =
            svc.wizard_start(StripId::new(STRIP), None).await.unwrap()
        else {
            panic!("expected a probe")
        };
        for _ in 0..probe.total - 1 {
            assert!(matches!(
                svc.wizard_answer_power(false).await.unwrap(),
                WizardState::Probing { .. }
            ));
        }
        assert_eq!(
            svc.wizard_answer_power(false).await.unwrap(),
            WizardState::Exhausted
        );
    }

    #[tokio::test]
    async fn discovered_gatt_services_rank_matching_profiles_first() {
        let (svc, link, _dir) = service();
        link.set_services(vec![Uuid::from_u128(
            0x0000ffe0_0000_1000_8000_00805f9b34fb,
        )]);
        let WizardState::Probing { probe } =
            svc.wizard_start(StripId::new(STRIP), None).await.unwrap()
        else {
            panic!("expected a probe")
        };
        assert!(
            ["ledble", "led-jackyled", "xrocker"].contains(&probe.profile_id.as_str()),
            "first candidate was {}",
            probe.profile_id
        );
    }

    #[tokio::test]
    async fn bad_colour_answers_keep_the_session_so_the_step_can_be_redone() {
        let (svc, _link, _dir) = service();
        svc.wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await
            .unwrap();
        svc.wizard_answer_power(true).await.unwrap();
        svc.wizard_answer_colour(Seen::Red).await.unwrap();

        let bad = svc
            .wizard_finish("x", Some([Seen::Red, Seen::Red, Seen::Blue]), false, None)
            .await;
        assert!(matches!(bad, Err(ServiceError::BadColourAnswers)));
        assert!(svc.snapshot().await.strips.is_empty());

        let ok = svc
            .wizard_finish("x", Some([Seen::Green, Seen::Red, Seen::Blue]), false, None)
            .await
            .unwrap();
        assert_eq!(
            ok.calibration.channel_order,
            crate::calibration::ChannelOrder::Grb
        );
    }

    #[tokio::test]
    async fn finishing_before_recognition_is_an_error() {
        let (svc, _link, _dir) = service();
        svc.wizard_start(StripId::new(STRIP), None).await.unwrap();
        assert!(matches!(
            svc.wizard_finish("x", None, false, None).await,
            Err(ServiceError::NotRecognized)
        ));
    }

    #[tokio::test]
    async fn wizard_calls_without_a_session_fail_cleanly() {
        let (svc, _link, _dir) = service();
        assert!(matches!(
            svc.wizard_probe().await,
            Err(ServiceError::NoSession)
        ));
        assert!(matches!(
            svc.wizard_answer_power(true).await,
            Err(ServiceError::NoSession)
        ));
        assert!(matches!(
            svc.wizard_colour_test(0).await,
            Err(ServiceError::NoSession)
        ));
    }

    #[tokio::test]
    async fn test_indices_are_range_checked() {
        let (svc, _link, _dir) = service();
        add_mrstar_session(&svc).await;
        assert!(matches!(
            svc.wizard_colour_test(3).await,
            Err(ServiceError::BadColourIndex)
        ));
        assert!(matches!(
            svc.wizard_intensity_test(6).await,
            Err(ServiceError::BadLevelIndex)
        ));
    }

    /// Leaves a recognized session open (does not finish).
    async fn add_mrstar_session(svc: &Service<FakeLink>) {
        svc.wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await
            .unwrap();
        svc.wizard_answer_power(true).await.unwrap();
        svc.wizard_answer_colour(Seen::Red).await.unwrap();
    }

    #[tokio::test]
    async fn apply_reaches_every_member_of_a_group() {
        let (svc, link, _dir) = service();
        for id in ["s1", "s2", "s3"] {
            add_mrstar(&svc, id, id).await;
        }
        svc.create_group(GroupId::new("living-room"), "Living Room")
            .await
            .unwrap();
        for id in ["s1", "s2", "s3"] {
            svc.add_to_group(&GroupId::new("living-room"), &StripId::new(id))
                .await
                .unwrap();
        }

        let report = svc
            .apply(
                &[Target::Group(GroupId::new("living-room"))],
                Command::Power(false),
            )
            .await
            .unwrap();

        assert_eq!(report.ok.len(), 3);
        let written: Vec<String> = link.writes().into_iter().map(|(id, _)| id.0).collect();
        assert_eq!(written, ["s1", "s2", "s3"]);
    }

    #[tokio::test]
    async fn removing_a_strip_updates_the_saved_registry() {
        let (svc, _link, dir) = service();
        add_mrstar(&svc, "s1", "One").await;
        svc.remove_strip(&StripId::new("s1")).await.unwrap();
        assert!(svc.snapshot().await.strips.is_empty());
        let on_disk = Registry::load(&dir.path().join("registry.json")).unwrap();
        assert!(on_disk.strip(&StripId::new("s1")).is_none());
    }

    #[tokio::test]
    async fn warming_up_after_a_restart_connects_the_saved_strips_so_the_first_command_does_not() {
        let (svc, link, dir) = service();
        add_mrstar(&svc, "s1", "One").await;
        add_mrstar(&svc, "s2", "Two").await;
        drop(svc);
        let again = Service::new(link.clone(), dir.path().join("registry.json")).unwrap();
        let before = link.connects().len();

        let connected = again.warm_up().await;

        assert_eq!(connected.len(), 2);
        assert_eq!(link.prepared().last().map(Vec::len), Some(2));
        assert_eq!(link.connects().len() - before, 2);
        again
            .apply(&[Target::Strip(StripId::new("s1"))], Command::Power(true))
            .await
            .unwrap();
        assert_eq!(
            link.connects().len() - before,
            2,
            "no reconnect for the first command"
        );
    }

    #[tokio::test]
    async fn bluetooth_state_is_whatever_the_link_reports() {
        let (svc, link, _dir) = service();
        assert_eq!(svc.bluetooth_on().await, None);
        link.set_powered(Some(false));
        assert_eq!(svc.bluetooth_on().await, Some(false));
        link.set_powered(Some(true));
        assert_eq!(svc.bluetooth_on().await, Some(true));
    }

    #[tokio::test]
    async fn warming_up_with_nothing_saved_does_nothing() {
        let (svc, link, _dir) = service();
        svc.warm_up().await;
        assert!(link.prepared().is_empty());
        assert!(link.connect_attempts().is_empty());
    }

    #[tokio::test]
    async fn the_registry_survives_a_restart() {
        let (svc, link, dir) = service();
        add_mrstar(&svc, "s1", "One").await;
        drop(svc);

        let again = Service::new(link, dir.path().join("registry.json")).unwrap();

        assert_eq!(again.snapshot().await.strips.len(), 1);
    }

    /// Makes every later save fail: the registry path becomes a directory, so the final rename
    /// of the temporary file onto it is refused.
    fn break_saving(dir: &tempfile::TempDir) {
        let path = dir.path().join("registry.json");
        if path.exists() {
            std::fs::remove_file(&path).unwrap();
        }
        std::fs::create_dir(&path).unwrap();
    }

    #[tokio::test]
    async fn a_failed_save_leaves_the_registry_and_the_session_untouched() {
        let (svc, _link, dir) = service();
        add_mrstar_session(&svc).await;
        break_saving(&dir);

        let failed = svc.wizard_finish("Living Room", None, false, None).await;

        assert!(matches!(failed, Err(ServiceError::Save(_))));
        assert!(svc.snapshot().await.strips.is_empty());
        // the session is still alive: the step can be retried
        assert!(matches!(
            svc.wizard_colour_test(0).await,
            Ok(report) if report.ok == vec![StripId::new(STRIP)]
        ));
    }

    #[tokio::test]
    async fn a_failed_save_does_not_apply_a_group_change() {
        let (svc, _link, dir) = service();
        break_saving(&dir);

        let failed = svc.create_group(GroupId::new("living-room"), "Living Room").await;

        assert!(matches!(failed, Err(ServiceError::Save(_))));
        assert!(svc.snapshot().await.groups.is_empty());
    }

    #[tokio::test]
    async fn a_failed_save_does_not_apply_a_membership_or_a_removal() {
        let (svc, _link, dir) = service();
        add_mrstar(&svc, "s1", "One").await;
        svc.create_group(GroupId::new("living-room"), "Living Room")
            .await
            .unwrap();
        break_saving(&dir);

        let joined = svc
            .add_to_group(&GroupId::new("living-room"), &StripId::new("s1"))
            .await;
        let removed = svc.remove_strip(&StripId::new("s1")).await;

        assert!(matches!(joined, Err(ServiceError::Save(_))));
        assert!(matches!(removed, Err(ServiceError::Save(_))));
        let snap = svc.snapshot().await;
        assert_eq!(snap.strips.len(), 1);
        assert!(snap.groups[0].members.is_empty());
    }

    #[tokio::test]
    async fn creating_a_group_twice_is_an_error() {
        let (svc, _link, _dir) = service();
        svc.create_group(GroupId::new("living-room"), "Living Room")
            .await
            .unwrap();

        let again = svc.create_group(GroupId::new("living-room"), "Other name").await;

        assert!(matches!(again, Err(ServiceError::GroupExists(id)) if id == GroupId::new("living-room")));
        assert_eq!(svc.snapshot().await.groups[0].name, "Living Room");
    }

    #[tokio::test]
    async fn a_corrupt_registry_file_is_quarantined_and_the_service_starts_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("registry.json");
        std::fs::write(&path, "not json").unwrap();

        let svc = Service::new(Arc::new(FakeLink::default()), path.clone()).unwrap();

        assert!(svc.snapshot().await.strips.is_empty());
        assert!(!path.exists(), "the corrupt file was moved away");
        let quarantined: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("registry.json.corrupt-"))
            })
            .collect();
        assert_eq!(quarantined.len(), 1);
        assert_eq!(
            std::fs::read_to_string(&quarantined[0]).unwrap(),
            "not json"
        );
    }

    #[tokio::test]
    async fn a_strip_that_works_then_fails_is_reported_unreachable_only() {
        let (svc, link, _dir) = service();
        svc.wizard_start(StripId::new(STRIP), Some("GATT--DEMO".into()))
            .await
            .unwrap();

        let report1 = svc.wizard_probe().await.unwrap();
        assert_eq!(report1.ok, vec![StripId::new(STRIP)]);
        assert!(report1.unreachable.is_empty());

        link.fail_write(STRIP, 99);
        let report2 = svc.wizard_probe().await.unwrap();

        assert!(report2.ok.is_empty());
        assert_eq!(report2.unreachable, vec![StripId::new(STRIP)]);
    }

    #[test]
    fn an_unreadable_registry_is_not_quarantined() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("registry.json");
        std::fs::create_dir(&path).unwrap(); // a directory where the file should be: unreadable, not corrupt

        let result = Service::new(Arc::new(FakeLink::default()), path.clone());

        assert!(result.is_err());
        assert!(path.is_dir(), "left untouched");
        let quarantined = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".corrupt-"))
            .count();
        assert_eq!(quarantined, 0);
    }

    // Smoke test. On the current-thread runtime of #[tokio::test] the futures run to completion in turn, so this cannot expose a lost update by itself; the guarantee comes from each mutator holding ONE registry guard across clone, save and swap.
    #[tokio::test]
    async fn concurrent_group_mutations_do_not_lose_updates() {
        let (svc, _link, dir) = service();
        add_mrstar(&svc, "s1", "Strip One").await;

        let g1 = GroupId::new("g1");
        let g2 = GroupId::new("g2");
        let s1 = StripId::new("s1");

        let (r1, r2, r3) = tokio::join!(
            svc.create_group(g1.clone(), "Group 1"),
            svc.add_to_group(&g1, &s1),
            svc.create_group(g2.clone(), "Group 2")
        );

        assert!(r1.is_ok());
        assert!(r2.is_ok());
        assert!(r3.is_ok());

        let snap = svc.snapshot().await;
        assert_eq!(snap.groups.len(), 2);
        let on_disk = Registry::load(&dir.path().join("registry.json")).unwrap();
        assert_eq!(on_disk.groups().count(), 2);
    }

    #[test]
    fn quarantine_names_never_overwrite_an_earlier_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("registry.json");
        let first = quarantine_path(&path);
        std::fs::write(&first, "earlier").unwrap();

        let second = quarantine_path(&path);

        assert_ne!(first, second);
        assert!(second.to_string_lossy().contains(".corrupt-"));
        assert!(!second.exists());
    }

    #[test]
    fn merging_reports_does_not_duplicate_ids() {
        let s = StripId::new("S");
        let mut into = Report::default();
        merge_reports(
            &mut into,
            Report {
                ok: vec![s.clone()],
                ..Report::default()
            },
            &s,
        );
        merge_reports(
            &mut into,
            Report {
                ok: vec![s.clone()],
                ..Report::default()
            },
            &s,
        );
        assert_eq!(into.ok, vec![s]);
    }

    #[test]
    fn unsupported_is_kept_for_strips_that_stay_reachable() {
        let s = StripId::new("S");
        let mut into = Report::default();
        merge_reports(
            &mut into,
            Report {
                ok: vec![s.clone()],
                unsupported: vec![s.clone()],
                ..Report::default()
            },
            &s,
        );
        assert_eq!(into.ok, vec![s.clone()]);
        assert_eq!(into.unsupported, vec![s]);
    }

    #[test]
    fn an_unreachable_report_removes_the_strip_from_ok_and_unsupported() {
        let s = StripId::new("S");
        let mut into = Report {
            ok: vec![s.clone()],
            unsupported: vec![s.clone()],
            ..Report::default()
        };
        merge_reports(
            &mut into,
            Report {
                unreachable: vec![s.clone()],
                ..Report::default()
            },
            &s,
        );
        assert!(into.ok.is_empty());
        assert!(into.unsupported.is_empty());
        assert_eq!(into.unreachable, vec![s]);
    }

    #[tokio::test]
    async fn group_edits_are_saved_and_survive_a_restart() {
        let (svc, link, dir) = service();
        for id in ["s1", "s2", "s3"] {
            add_mrstar(&svc, id, id).await;
        }
        let g = GroupId::new("living-room");
        svc.create_group(g.clone(), "Living Room").await.unwrap();
        for id in ["s1", "s2", "s3"] {
            svc.add_to_group(&g, &StripId::new(id)).await.unwrap();
        }

        svc.reorder_group(
            &g,
            &[StripId::new("s3"), StripId::new("s1"), StripId::new("s2")],
        )
        .await
        .unwrap();
        svc.remove_from_group(&g, &StripId::new("s2"))
            .await
            .unwrap();
        svc.rename_group(&g, "TV Lounge").await.unwrap();
        svc.rename_strip(&StripId::new("s1"), "Bancada")
            .await
            .unwrap();

        let again = Service::new(link, dir.path().join("registry.json")).unwrap();
        let snap = again.snapshot().await;
        let group = &snap.groups[0];
        assert_eq!(group.name, "TV Lounge");
        assert_eq!(group.members, vec![StripId::new("s3"), StripId::new("s1")]);
        assert!(snap.strips.iter().any(|s| s.name == "Bancada"));
        assert_eq!(
            snap.strips.len(),
            3,
            "removing from a group keeps the strip"
        );
    }

    #[tokio::test]
    async fn deleting_a_group_keeps_its_strips() {
        let (svc, _link, _dir) = service();
        add_mrstar(&svc, "s1", "One").await;
        let g = GroupId::new("g");
        svc.create_group(g.clone(), "G").await.unwrap();
        svc.add_to_group(&g, &StripId::new("s1")).await.unwrap();

        svc.delete_group(&g).await.unwrap();

        let snap = svc.snapshot().await;
        assert!(snap.groups.is_empty());
        assert_eq!(snap.strips.len(), 1);
        assert!(matches!(
            svc.delete_group(&g).await,
            Err(ServiceError::Registry(RegistryError::UnknownGroup(_)))
        ));
    }

    #[tokio::test]
    async fn a_bad_reorder_changes_nothing() {
        let (svc, _link, _dir) = service();
        add_mrstar(&svc, "s1", "One").await;
        add_mrstar(&svc, "s2", "Two").await;
        let g = GroupId::new("g");
        svc.create_group(g.clone(), "G").await.unwrap();
        svc.add_to_group(&g, &StripId::new("s1")).await.unwrap();
        svc.add_to_group(&g, &StripId::new("s2")).await.unwrap();

        let bad = svc.reorder_group(&g, &[StripId::new("s2")]).await;

        assert!(matches!(
            bad,
            Err(ServiceError::Registry(RegistryError::BadOrder))
        ));
        assert_eq!(
            svc.snapshot().await.groups[0].members,
            vec![StripId::new("s1"), StripId::new("s2")]
        );
    }

    #[tokio::test]
    async fn the_power_test_blinks_the_recognized_strip() {
        let (svc, link, _dir) = service();
        add_mrstar_session(&svc).await;

        let report = svc.wizard_power_test().await.unwrap();

        assert_eq!(report.ok, vec![StripId::new(STRIP)]);
        assert_eq!(
            bytes(&link),
            vec![
                vec![0xBC, 0x01, 0x01, 0x00, 0x55],
                vec![0xBC, 0x01, 0x01, 0x01, 0x55]
            ]
        );
    }

    #[tokio::test]
    async fn the_power_test_needs_a_recognized_strip() {
        let (svc, _link, _dir) = service();
        svc.wizard_start(StripId::new(STRIP), None).await.unwrap();
        assert!(matches!(
            svc.wizard_power_test().await,
            Err(ServiceError::NotRecognized)
        ));
    }

    #[test]
    fn the_catalogue_marks_only_mrstar_as_verified() {
        let all = profile_catalogue();
        assert!(all.len() > 10);
        let verified: Vec<&str> = all
            .iter()
            .filter(|p| p.verified)
            .map(|p| p.id.as_str())
            .collect();
        assert_eq!(verified, vec!["mrstar"]);
        assert!(all.iter().any(|p| p.id == "xsl" && !p.capabilities.color));
    }

    #[tokio::test]
    async fn recalibrating_a_saved_strip_skips_recognition_and_keeps_its_id() {
        let (svc, link, _dir) = service();
        add_mrstar(&svc, STRIP, "Old name").await;

        let state = svc.wizard_recalibrate(StripId::new(STRIP)).await.unwrap();
        assert!(
            matches!(state, WizardState::Recognized { ref profile_id, .. } if profile_id == "mrstar")
        );
        svc.wizard_power_test().await.unwrap();
        assert_eq!(bytes(&link).len(), 2, "the power test reaches the strip");
        let strip = svc
            .wizard_finish(
                "New name",
                Some([Seen::Green, Seen::Red, Seen::Blue]),
                false,
                None,
            )
            .await
            .unwrap();

        assert_eq!(strip.id, StripId::new(STRIP));
        assert_eq!(strip.calibration.channel_order, ChannelOrder::Grb);
        let snap = svc.snapshot().await;
        assert_eq!(snap.strips.len(), 1, "replaced, not duplicated");
        assert_eq!(snap.strips[0].name, "New name");
    }

    #[tokio::test]
    async fn recalibrating_an_unknown_strip_is_an_error() {
        let (svc, _link, _dir) = service();
        assert!(matches!(
            svc.wizard_recalibrate(StripId::new("ghost")).await,
            Err(ServiceError::Registry(RegistryError::UnknownStrip(_)))
        ));
    }

    #[tokio::test]
    async fn the_channel_order_can_be_changed_and_is_saved() {
        let (svc, link, dir) = service();
        add_mrstar(&svc, "s1", "One").await;

        svc.set_channel_order(&StripId::new("s1"), ChannelOrder::Bgr)
            .await
            .unwrap();

        let again = Service::new(link, dir.path().join("registry.json")).unwrap();
        assert_eq!(
            again.snapshot().await.strips[0].calibration.channel_order,
            ChannelOrder::Bgr
        );
        assert!(matches!(
            svc.set_channel_order(&StripId::new("ghost"), ChannelOrder::Rgb)
                .await,
            Err(ServiceError::Registry(RegistryError::UnknownStrip(_)))
        ));
    }

    #[tokio::test]
    async fn leaving_the_wizard_puts_a_dimmed_strip_back_to_full_brightness() {
        let (svc, link, _dir) = service();
        add_mrstar_session(&svc).await;
        svc.wizard_intensity_test(5).await.unwrap(); // 3 %: the strip now looks switched off
        let before = bytes(&link).len();

        svc.wizard_cancel().await;

        let sent = bytes(&link);
        assert_eq!(sent.len(), before + 1);
        assert_eq!(sent.last().unwrap()[1], 0x05, "a brightness frame");
        assert_eq!(&sent.last().unwrap()[3..5], &[0x03, 0xE8], "1000 = full");
    }

    #[tokio::test]
    async fn finishing_the_wizard_restores_full_brightness_too() {
        let (svc, link, _dir) = service();
        add_mrstar_session(&svc).await;
        svc.wizard_intensity_test(4).await.unwrap();
        let before = bytes(&link).len();

        svc.wizard_finish("Strip", None, false, None).await.unwrap();

        assert_eq!(bytes(&link).len(), before + 1);
    }

    #[tokio::test]
    async fn a_strip_that_was_never_dimmed_is_left_alone_when_the_wizard_ends() {
        let (svc, link, _dir) = service();
        add_mrstar_session(&svc).await;
        svc.wizard_intensity_test(0).await.unwrap(); // 100 %
        let before = bytes(&link).len();

        svc.wizard_cancel().await;

        assert_eq!(bytes(&link).len(), before);
    }
}
