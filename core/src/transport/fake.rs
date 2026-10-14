//! In-memory Link for tests. Records every call and can be told to fail.

use super::{Discovered, Link, LinkError, Scanner};
use crate::ids::StripId;
use async_trait::async_trait;
use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Default)]
struct Inner {
    live: HashSet<StripId>,
    peak: usize,
    attempts: Vec<StripId>,
    connects: Vec<StripId>,
    disconnects: Vec<StripId>,
    writes: Vec<(StripId, Vec<u8>)>,
    connect_failures: HashMap<StripId, u32>,
    write_failures: HashMap<StripId, u32>,
    services_failures: HashMap<StripId, u32>,
    services: Option<Vec<Uuid>>,
    discovered: Vec<Discovered>,
    prepared: Vec<Vec<StripId>>,
    powered: Option<bool>,
}

#[derive(Default)]
pub struct FakeLink(Mutex<Inner>);

impl FakeLink {
    /// Services returned by `Link::services` (default: only FFF0).
    pub fn set_services(&self, services: Vec<Uuid>) {
        self.0.lock().services = Some(services);
    }

    /// What `Scanner::scan` returns.
    pub fn set_discovered(&self, discovered: Vec<Discovered>) {
        self.0.lock().discovered = discovered;
    }

    pub fn fail_connect(&self, id: &str, times: u32) {
        self.0
            .lock()
            .connect_failures
            .insert(StripId::new(id), times);
    }

    pub fn fail_write(&self, id: &str, times: u32) {
        self.0.lock().write_failures.insert(StripId::new(id), times);
    }

    /// The next `times` `services` calls fail, as on a link the strip silently dropped.
    pub fn fail_services(&self, id: &str, times: u32) {
        self.0
            .lock()
            .services_failures
            .insert(StripId::new(id), times);
    }

    pub fn peak_live(&self) -> usize {
        self.0.lock().peak
    }

    /// Every connect call, successful or not.
    pub fn connect_attempts(&self) -> Vec<StripId> {
        self.0.lock().attempts.clone()
    }

    /// Successful connects only.
    pub fn connects(&self) -> Vec<StripId> {
        self.0.lock().connects.clone()
    }

    /// What `Link::powered` answers (default: cannot tell).
    pub fn set_powered(&self, powered: Option<bool>) {
        self.0.lock().powered = powered;
    }

    /// Every `Link::prepare` call, with the ids it got.
    pub fn prepared(&self) -> Vec<Vec<StripId>> {
        self.0.lock().prepared.clone()
    }

    pub fn disconnects(&self) -> Vec<StripId> {
        self.0.lock().disconnects.clone()
    }

    pub fn writes(&self) -> Vec<(StripId, Vec<u8>)> {
        self.0.lock().writes.clone()
    }
}

#[async_trait]
impl Link for FakeLink {
    async fn prepare(&self, ids: &[StripId]) {
        self.0.lock().prepared.push(ids.to_vec());
    }

    async fn powered(&self) -> Option<bool> {
        self.0.lock().powered
    }

    async fn connect(&self, id: &StripId) -> Result<(), LinkError> {
        let mut s = self.0.lock();
        s.attempts.push(id.clone());
        if let Some(n) = s.connect_failures.get_mut(id) {
            if *n > 0 {
                *n -= 1;
                return Err(LinkError::Connect("injected".into()));
            }
        }
        s.live.insert(id.clone());
        s.peak = s.peak.max(s.live.len());
        s.connects.push(id.clone());
        Ok(())
    }

    async fn write(
        &self,
        id: &StripId,
        _characteristic: Uuid,
        bytes: &[u8],
    ) -> Result<(), LinkError> {
        let mut s = self.0.lock();
        if !s.live.contains(id) {
            return Err(LinkError::Write("not connected".into()));
        }
        if let Some(n) = s.write_failures.get_mut(id) {
            if *n > 0 {
                *n -= 1;
                return Err(LinkError::Write("injected".into()));
            }
        }
        s.writes.push((id.clone(), bytes.to_vec()));
        Ok(())
    }

    async fn disconnect(&self, id: &StripId) -> Result<(), LinkError> {
        let mut s = self.0.lock();
        s.live.remove(id);
        s.disconnects.push(id.clone());
        Ok(())
    }

    async fn services(&self, id: &StripId) -> Result<Vec<Uuid>, LinkError> {
        let mut s = self.0.lock();
        if let Some(n) = s.services_failures.get_mut(id) {
            if *n > 0 {
                *n -= 1;
                return Err(LinkError::Connect("injected".into()));
            }
        }
        Ok(s.services
            .clone()
            .unwrap_or_else(|| vec![Uuid::from_u128(0x0000fff0_0000_1000_8000_00805f9b34fb)]))
    }
}

#[async_trait]
impl Scanner for FakeLink {
    async fn scan(&self, _duration: std::time::Duration) -> Result<Vec<Discovered>, LinkError> {
        Ok(self.0.lock().discovered.clone())
    }
}
