//! Strips, groups (many-to-many) and persistence. No limit on the number of items.

use crate::calibration::{Calibration, Capabilities};
use crate::families::profile_by_id;
use crate::ids::{GroupId, StripId};
use crate::pool::Job;
use crate::protocol::Command;
use crate::setup::SetupResult;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::io;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Strip {
    pub id: StripId,
    pub name: String,
    /// Profile id, see `families::profile_by_id`.
    pub profile: String,
    /// Measured by the setup wizard. Files written before the wizard existed load as the default.
    #[serde(default)]
    pub calibration: Calibration,
}

impl Strip {
    /// A strip as the wizard's last screen creates it.
    pub fn from_setup(id: StripId, name: &str, result: &SetupResult) -> Self {
        Self {
            id,
            name: name.to_string(),
            profile: result.profile_id.clone(),
            calibration: result.calibration,
        }
    }

    /// Capabilities of the profile with the wizard's measurements applied. Returns `None` if the
    /// profile is unknown.
    pub fn capabilities(&self) -> Option<Capabilities> {
        profile_by_id(&self.profile).map(|p| Capabilities {
            white: self.calibration.has_white,
            ..p.capabilities()
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Group {
    pub id: GroupId,
    pub name: String,
    pub members: Vec<StripId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "id", rename_all = "snake_case")]
pub enum Target {
    Strip(StripId),
    Group(GroupId),
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RegistryError {
    #[error("unknown strip {0:?}")]
    UnknownStrip(StripId),
    #[error("unknown group {0:?}")]
    UnknownGroup(GroupId),
    #[error("unknown profile {0:?}")]
    UnknownProfile(String),
    #[error("the new order must list exactly the current members of the group")]
    BadOrder,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Registry {
    strips: BTreeMap<StripId, Strip>,
    groups: BTreeMap<GroupId, Group>,
}

impl Registry {
    pub fn add_strip(&mut self, strip: Strip) {
        self.strips.insert(strip.id.clone(), strip);
    }

    pub fn strips(&self) -> impl Iterator<Item = &Strip> {
        self.strips.values()
    }

    pub fn groups(&self) -> impl Iterator<Item = &Group> {
        self.groups.values()
    }

    pub fn strip(&self, id: &StripId) -> Option<&Strip> {
        self.strips.get(id)
    }
    pub fn group(&self, id: &GroupId) -> Option<&Group> {
        self.groups.get(id)
    }

    /// Also removes the strip from every group.
    pub fn remove_strip(&mut self, id: &StripId) {
        self.strips.remove(id);
        for group in self.groups.values_mut() {
            group.members.retain(|m| m != id);
        }
    }

    pub fn rename_strip(&mut self, id: &StripId, name: &str) -> Result<(), RegistryError> {
        let strip = self
            .strips
            .get_mut(id)
            .ok_or_else(|| RegistryError::UnknownStrip(id.clone()))?;
        strip.name = name.to_string();
        Ok(())
    }

    pub fn set_channel_order(
        &mut self,
        id: &StripId,
        order: crate::calibration::ChannelOrder,
    ) -> Result<(), RegistryError> {
        let strip = self
            .strips
            .get_mut(id)
            .ok_or_else(|| RegistryError::UnknownStrip(id.clone()))?;
        strip.calibration.channel_order = order;
        Ok(())
    }

    pub fn rename_group(&mut self, id: &GroupId, name: &str) -> Result<(), RegistryError> {
        let group = self
            .groups
            .get_mut(id)
            .ok_or_else(|| RegistryError::UnknownGroup(id.clone()))?;
        group.name = name.to_string();
        Ok(())
    }

    /// Deletes the group only; its strips stay in the registry.
    pub fn remove_group(&mut self, id: &GroupId) -> Result<(), RegistryError> {
        self.groups
            .remove(id)
            .map(|_| ())
            .ok_or_else(|| RegistryError::UnknownGroup(id.clone()))
    }

    /// Takes a strip out of one group; not being a member is not an error.
    pub fn remove_member(&mut self, group: &GroupId, strip: &StripId) -> Result<(), RegistryError> {
        let g = self
            .groups
            .get_mut(group)
            .ok_or_else(|| RegistryError::UnknownGroup(group.clone()))?;
        g.members.retain(|m| m != strip);
        Ok(())
    }

    /// Reorders a group. `order` must be a permutation of the current members.
    pub fn set_members(&mut self, group: &GroupId, order: &[StripId]) -> Result<(), RegistryError> {
        let g = self
            .groups
            .get_mut(group)
            .ok_or_else(|| RegistryError::UnknownGroup(group.clone()))?;
        let mut current = g.members.clone();
        let mut wanted = order.to_vec();
        current.sort();
        wanted.sort();
        if current != wanted {
            return Err(RegistryError::BadOrder);
        }
        g.members = order.to_vec();
        Ok(())
    }

    pub fn add_group(&mut self, id: GroupId, name: &str) {
        self.groups.entry(id.clone()).or_insert_with(|| Group {
            id,
            name: name.to_string(),
            members: Vec::new(),
        });
    }

    /// Idempotent. A strip may belong to any number of groups.
    pub fn add_member(&mut self, group: &GroupId, strip: &StripId) -> Result<(), RegistryError> {
        if !self.strips.contains_key(strip) {
            return Err(RegistryError::UnknownStrip(strip.clone()));
        }
        let g = self
            .groups
            .get_mut(group)
            .ok_or_else(|| RegistryError::UnknownGroup(group.clone()))?;
        if !g.members.contains(strip) {
            g.members.push(strip.clone());
        }
        Ok(())
    }

    /// Expands targets to a unique list of strips, first-seen order.
    pub fn resolve(&self, targets: &[Target]) -> Result<Vec<StripId>, RegistryError> {
        let mut seen: HashSet<StripId> = HashSet::new();
        let mut out = Vec::new();
        let mut push = |id: &StripId| {
            if seen.insert(id.clone()) {
                out.push(id.clone());
            }
        };
        for target in targets {
            match target {
                Target::Strip(id) => {
                    if !self.strips.contains_key(id) {
                        return Err(RegistryError::UnknownStrip(id.clone()));
                    }
                    push(id);
                }
                Target::Group(id) => {
                    let g = self
                        .groups
                        .get(id)
                        .ok_or_else(|| RegistryError::UnknownGroup(id.clone()))?;
                    for member in &g.members {
                        if !self.strips.contains_key(member) {
                            return Err(RegistryError::UnknownStrip(member.clone()));
                        }
                        push(member);
                    }
                }
            }
        }
        Ok(out)
    }

    /// One job per resolved strip, using each strip's own profile.
    pub fn jobs(&self, targets: &[Target], cmd: Command) -> Result<Vec<Job>, RegistryError> {
        self.resolve(targets)?
            .into_iter()
            .map(|id| {
                let strip = self
                    .strips
                    .get(&id)
                    .ok_or_else(|| RegistryError::UnknownStrip(id.clone()))?;
                let profile = profile_by_id(&strip.profile)
                    .ok_or_else(|| RegistryError::UnknownProfile(strip.profile.clone()))?;
                Ok(Job {
                    strip: id,
                    profile,
                    cmd,
                    calibration: strip.calibration,
                })
            })
            .collect()
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        let json = serde_json::to_vec_pretty(self).map_err(io::Error::other)?;
        let tmp_path = path.with_extension("json.tmp");
        let mut tmp_file = std::fs::File::create(&tmp_path)?;
        std::io::Write::write_all(&mut tmp_file, &json)?;
        tmp_file.sync_all()?;
        std::fs::rename(&tmp_path, path)?;
        Ok(())
    }

    pub fn load(path: &Path) -> io::Result<Self> {
        let bytes = std::fs::read(path)?;
        serde_json::from_slice(&bytes)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "corrupt registry JSON"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pool::Pool;
    use crate::transport::fake::FakeLink;
    use std::sync::Arc;

    fn strip(id: &str) -> Strip {
        Strip {
            id: StripId::new(id),
            name: format!("strip {id}"),
            profile: "mrstar".into(),
            calibration: Calibration::default(),
        }
    }

    fn registry_with(n: usize) -> Registry {
        let mut r = Registry::default();
        for i in 0..n {
            r.add_strip(strip(&format!("s{i}")));
        }
        r
    }

    #[test]
    fn group_resolves_to_all_members_with_no_upper_bound() {
        let mut r = registry_with(12);
        r.add_group(GroupId::new("room"), "Room");
        for i in 0..12 {
            r.add_member(&GroupId::new("room"), &StripId::new(&format!("s{i}")))
                .unwrap();
        }

        let strips = r.resolve(&[Target::Group(GroupId::new("room"))]).unwrap();

        assert_eq!(strips.len(), 12);
    }

    #[test]
    fn overlapping_targets_resolve_each_strip_once_in_first_seen_order() {
        let mut r = registry_with(3);
        r.add_group(GroupId::new("a"), "A");
        r.add_group(GroupId::new("b"), "B");
        r.add_member(&GroupId::new("a"), &StripId::new("s0"))
            .unwrap();
        r.add_member(&GroupId::new("a"), &StripId::new("s1"))
            .unwrap();
        r.add_member(&GroupId::new("b"), &StripId::new("s1"))
            .unwrap();
        r.add_member(&GroupId::new("b"), &StripId::new("s2"))
            .unwrap();

        let strips = r
            .resolve(&[
                Target::Group(GroupId::new("a")),
                Target::Group(GroupId::new("b")),
                Target::Strip(StripId::new("s0")),
            ])
            .unwrap();

        assert_eq!(
            strips,
            vec![StripId::new("s0"), StripId::new("s1"), StripId::new("s2")]
        );
    }

    #[test]
    fn unknown_targets_are_errors() {
        let r = registry_with(1);
        assert_eq!(
            r.resolve(&[Target::Group(GroupId::new("nope"))]),
            Err(RegistryError::UnknownGroup(GroupId::new("nope")))
        );
        assert_eq!(
            r.resolve(&[Target::Strip(StripId::new("nope"))]),
            Err(RegistryError::UnknownStrip(StripId::new("nope")))
        );
    }

    #[test]
    fn adding_an_unknown_strip_to_a_group_is_an_error() {
        let mut r = registry_with(1);
        r.add_group(GroupId::new("g"), "G");
        assert_eq!(
            r.add_member(&GroupId::new("g"), &StripId::new("ghost")),
            Err(RegistryError::UnknownStrip(StripId::new("ghost")))
        );
    }

    #[test]
    fn removing_a_strip_removes_it_from_groups() {
        let mut r = registry_with(2);
        r.add_group(GroupId::new("g"), "G");
        r.add_member(&GroupId::new("g"), &StripId::new("s0"))
            .unwrap();
        r.add_member(&GroupId::new("g"), &StripId::new("s1"))
            .unwrap();

        r.remove_strip(&StripId::new("s0"));

        assert_eq!(
            r.resolve(&[Target::Group(GroupId::new("g"))]).unwrap(),
            vec![StripId::new("s1")]
        );
    }

    #[test]
    fn save_and_load_round_trip() {
        let mut r = registry_with(2);
        r.add_group(GroupId::new("g"), "G");
        r.add_member(&GroupId::new("g"), &StripId::new("s1"))
            .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("registry.json");

        r.save(&path).unwrap();
        let loaded = Registry::load(&path).unwrap();

        assert_eq!(loaded, r);
    }

    #[test]
    fn jobs_fail_for_an_unknown_profile() {
        let mut r = Registry::default();
        r.add_strip(Strip {
            id: StripId::new("x"),
            name: "x".into(),
            profile: "nope".into(),
            calibration: Calibration::default(),
        });
        assert_eq!(
            r.jobs(&[Target::Strip(StripId::new("x"))], Command::Power(true))
                .err(),
            Some(RegistryError::UnknownProfile("nope".into()))
        );
    }

    #[tokio::test]
    async fn a_twelve_strip_group_goes_through_the_pool_with_six_slots() {
        let mut r = registry_with(12);
        r.add_group(GroupId::new("room"), "Room");
        for i in 0..12 {
            r.add_member(&GroupId::new("room"), &StripId::new(&format!("s{i}")))
                .unwrap();
        }
        let link = Arc::new(FakeLink::default());
        let pool = Pool::new(link.clone(), 6);

        let jobs = r
            .jobs(
                &[Target::Group(GroupId::new("room"))],
                Command::Color {
                    hue: 240,
                    sat: 1000,
                },
            )
            .unwrap();
        let report = pool.dispatch(jobs).await;

        assert_eq!(report.ok.len(), 12);
        assert!(link.peak_live() <= 6);
    }

    #[test]
    fn dangling_group_member_from_persisted_data_does_not_panic() {
        // Create a valid registry and save it
        let mut r = registry_with(1);
        r.add_group(GroupId::new("g"), "G");
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("registry.json");
        r.save(&path).unwrap();

        // Read the JSON and hand-edit to add a dangling member
        let mut json = std::fs::read_to_string(&path).unwrap();
        // Replace the groups section to include a member "ghost" that doesn't exist in strips
        json = json.replace(r#""members": []"#, r#""members": ["ghost"]"#);
        std::fs::write(&path, json).unwrap();

        // Load the corrupted registry
        let loaded = Registry::load(&path).unwrap();

        // resolve should return error for unknown strip, not panic
        assert_eq!(
            loaded.resolve(&[Target::Group(GroupId::new("g"))]),
            Err(RegistryError::UnknownStrip(StripId::new("ghost")))
        );

        // jobs should also return error for unknown strip, not panic
        match loaded.jobs(&[Target::Group(GroupId::new("g"))], Command::Power(true)) {
            Err(RegistryError::UnknownStrip(_)) => {}
            _ => panic!("expected UnknownStrip error"),
        }
    }
    #[test]
    fn save_leaves_no_tmp_file() {
        let r = registry_with(1);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("registry.json");

        r.save(&path).unwrap();

        // Verify no .tmp file exists
        let tmp_path = path.with_extension("json.tmp");
        assert!(!tmp_path.exists(), ".tmp file should not exist after save");

        // Verify the actual file does exist
        assert!(path.exists(), "registry.json should exist after save");
    }

    #[test]
    fn from_setup_carries_the_wizard_result_into_jobs() {
        use crate::calibration::ChannelOrder;
        use crate::families::profile_by_id;
        use crate::setup::IntensityResult;

        let profile = profile_by_id("elk-bledom-a").unwrap();
        let result = SetupResult::new(
            profile.as_ref(),
            ChannelOrder::Grb,
            false,
            IntensityResult {
                min_brightness: 30,
                steps: 4,
            },
        );
        let mut r = Registry::default();
        r.add_strip(Strip::from_setup(StripId::new("k"), "Kitchen", &result));

        let jobs = r
            .jobs(&[Target::Strip(StripId::new("k"))], Command::Power(true))
            .unwrap();

        assert_eq!(jobs[0].profile.id(), "elk-bledom-a");
        assert_eq!(jobs[0].calibration.channel_order, ChannelOrder::Grb);
        assert_eq!(jobs[0].calibration.min_brightness, 30);
    }

    #[test]
    fn files_written_before_calibration_existed_still_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("old.json");
        std::fs::write(
            &path,
            r#"{"strips":{"a":{"id":"a","name":"A","profile":"mrstar"}},"groups":{}}"#,
        )
        .unwrap();

        let loaded = Registry::load(&path).unwrap();

        let strip = loaded.strip(&StripId::new("a")).unwrap();
        assert_eq!(strip.calibration, Calibration::default());
        // Capabilities are derived from profile and calibration
        let caps = strip.capabilities().unwrap();
        assert!(caps.color, "mrstar has color");
        assert!(caps.brightness, "mrstar has brightness");
    }

    #[test]
    fn capabilities_follow_the_profile_and_the_calibrated_white_flag() {
        // Capabilities with white enabled
        let mut strip = strip("W");
        strip.calibration.has_white = true;
        let caps = strip.capabilities().unwrap();
        assert!(caps.white, "white==true when calibrated with white");
        assert!(caps.color, "mrstar has color");

        // Same strip with white disabled
        strip.calibration.has_white = false;
        let caps = strip.capabilities().unwrap();
        assert!(!caps.white, "white==false when calibrated without white");
        assert!(caps.color, "mrstar still has color");

        // Unknown profile returns None
        strip.profile = "unknown-profile-xyz".to_string();
        assert!(
            strip.capabilities().is_none(),
            "unknown profile returns None"
        );
    }

    #[test]
    fn a_stale_capabilities_key_in_old_files_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("stale.json");
        // Old file with stale "capabilities" key; it should be ignored
        std::fs::write(
            &path,
            r#"{"strips":{"a":{"id":"a","name":"A","profile":"mrstar","capabilities":{"white":false,"color":false,"brightness":false}}},"groups":{}}"#,
        )
        .unwrap();

        let loaded = Registry::load(&path).unwrap();
        let strip = loaded.strip(&StripId::new("a")).unwrap();

        // Stale field was ignored; capabilities are freshly derived from profile
        let caps = strip.capabilities().unwrap();
        assert!(caps.color, "mrstar has color, not the stale false value");
        assert!(
            caps.brightness,
            "mrstar has brightness, not the stale false value"
        );
    }

    #[test]
    fn renaming_a_strip_or_group_changes_only_the_name() {
        let mut r = registry_with(1);
        r.add_group(GroupId::new("g"), "Old");
        r.rename_group(&GroupId::new("g"), "New").unwrap();
        r.rename_strip(&StripId::new("s0"), "Desk").unwrap();
        assert_eq!(r.groups().next().unwrap().name, "New");
        assert_eq!(r.strip(&StripId::new("s0")).unwrap().name, "Desk");
        assert_eq!(
            r.rename_strip(&StripId::new("nope"), "x"),
            Err(RegistryError::UnknownStrip(StripId::new("nope")))
        );
        assert_eq!(
            r.rename_group(&GroupId::new("nope"), "x"),
            Err(RegistryError::UnknownGroup(GroupId::new("nope")))
        );
    }

    #[test]
    fn removing_a_group_keeps_its_strips() {
        let mut r = registry_with(2);
        r.add_group(GroupId::new("g"), "G");
        r.add_member(&GroupId::new("g"), &StripId::new("s0"))
            .unwrap();
        r.remove_group(&GroupId::new("g")).unwrap();
        assert!(r.group(&GroupId::new("g")).is_none());
        assert!(r.strip(&StripId::new("s0")).is_some());
        assert_eq!(
            r.remove_group(&GroupId::new("g")),
            Err(RegistryError::UnknownGroup(GroupId::new("g")))
        );
    }

    #[test]
    fn removing_a_member_leaves_the_other_groups_alone() {
        let mut r = registry_with(2);
        for g in ["a", "b"] {
            r.add_group(GroupId::new(g), g);
            r.add_member(&GroupId::new(g), &StripId::new("s0")).unwrap();
        }
        r.remove_member(&GroupId::new("a"), &StripId::new("s0"))
            .unwrap();
        assert!(r.group(&GroupId::new("a")).unwrap().members.is_empty());
        assert_eq!(r.group(&GroupId::new("b")).unwrap().members.len(), 1);
        // not a member any more: still fine
        assert!(r
            .remove_member(&GroupId::new("a"), &StripId::new("s0"))
            .is_ok());
    }

    #[test]
    fn reordering_requires_a_permutation_of_the_members() {
        let mut r = registry_with(3);
        r.add_group(GroupId::new("g"), "G");
        for i in 0..3 {
            r.add_member(&GroupId::new("g"), &StripId::new(&format!("s{i}")))
                .unwrap();
        }
        let order = vec![StripId::new("s2"), StripId::new("s0"), StripId::new("s1")];
        r.set_members(&GroupId::new("g"), &order).unwrap();
        assert_eq!(r.group(&GroupId::new("g")).unwrap().members, order);

        let missing = vec![StripId::new("s2"), StripId::new("s0")];
        assert_eq!(
            r.set_members(&GroupId::new("g"), &missing),
            Err(RegistryError::BadOrder)
        );
        let stranger = vec![StripId::new("s2"), StripId::new("s0"), StripId::new("zzz")];
        assert_eq!(
            r.set_members(&GroupId::new("g"), &stranger),
            Err(RegistryError::BadOrder)
        );
        let dup = vec![StripId::new("s2"), StripId::new("s2"), StripId::new("s0")];
        assert_eq!(
            r.set_members(&GroupId::new("g"), &dup),
            Err(RegistryError::BadOrder)
        );
        assert_eq!(
            r.group(&GroupId::new("g")).unwrap().members,
            order,
            "unchanged after errors"
        );
    }
}
