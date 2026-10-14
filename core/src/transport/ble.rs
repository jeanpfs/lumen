//! Real BLE central over btleplug (macOS, Windows, Linux, Android).

/// Re-exported so the Android shell can call `btleplug::platform::init` without a second dependency.
pub use btleplug;

use super::{Discovered, Link, LinkError, Scanner};
use crate::ids::StripId;
use async_trait::async_trait;
use btleplug::api::{Central, CentralState, CharPropFlags, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::{Adapter, Manager, Peripheral};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::Mutex;
use uuid::Uuid;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const DISCOVER_TIMEOUT: Duration = Duration::from_secs(8);
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);
const FIND_SCAN: Duration = Duration::from_secs(6);
const SCAN_POLL: Duration = Duration::from_millis(100);

pub struct BleLink {
    adapter: Adapter,
    peripherals: Mutex<HashMap<StripId, Peripheral>>,
    scan_lock: tokio::sync::Mutex<()>,
}

impl BleLink {
    pub async fn new() -> Result<Self, LinkError> {
        let manager = Manager::new()
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?;
        let adapter = manager
            .adapters()
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?
            .into_iter()
            .next()
            .ok_or_else(|| LinkError::Connect("no Bluetooth adapter found".into()))?;
        Ok(Self {
            adapter,
            peripherals: Mutex::new(HashMap::new()),
            scan_lock: tokio::sync::Mutex::new(()),
        })
    }

    /// Scans for `duration` and returns everything seen, strongest signal first.
    pub async fn scan(&self, duration: Duration) -> Result<Vec<Discovered>, LinkError> {
        let _lock = self.scan_lock.lock().await;
        self.adapter
            .start_scan(ScanFilter::default())
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?;
        tokio::time::sleep(duration).await;
        self.adapter
            .stop_scan()
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?;
        let mut found = Vec::new();
        for p in self
            .adapter
            .peripherals()
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?
        {
            let props = p
                .properties()
                .await
                .map_err(|e| LinkError::Connect(e.to_string()))?;
            let (name, rssi, services) = match props {
                Some(pr) => (pr.local_name, pr.rssi, pr.services),
                None => (None, None, Vec::new()),
            };
            found.push(Discovered {
                id: StripId(p.id().to_string()),
                name,
                rssi,
                services,
            });
        }
        found.sort_by_key(|d| std::cmp::Reverse(d.rssi.unwrap_or(i16::MIN)));
        Ok(found)
    }

    async fn find(&self, id: &StripId) -> Result<Peripheral, LinkError> {
        if let Some(p) = self.peripherals.lock().await.get(id) {
            return Ok(p.clone());
        }
        // Not seen yet: scan, stopping the moment it shows up (a strip advertises many times a second, so
        // this is usually well under a second instead of a fixed wait).
        self.scan_for(std::slice::from_ref(id), FIND_SCAN).await?;
        self.lookup(id)
            .await?
            .ok_or_else(|| LinkError::Connect(format!("strip {} not found", id.0)))
    }

    /// Scans until every one of `ids` has been seen or `limit` has passed, whichever comes first.
    /// Returns without error when some were not seen; the caller's `lookup` tells.
    async fn scan_for(&self, ids: &[StripId], limit: Duration) -> Result<(), LinkError> {
        let _lock = self.scan_lock.lock().await;
        if self.all_known(ids).await? {
            return Ok(());
        }
        self.adapter
            .start_scan(ScanFilter::default())
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?;
        let deadline = tokio::time::Instant::now() + limit;
        while !self.all_known(ids).await? && tokio::time::Instant::now() < deadline {
            tokio::time::sleep(SCAN_POLL).await;
        }
        self.adapter
            .stop_scan()
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))
    }

    async fn all_known(&self, ids: &[StripId]) -> Result<bool, LinkError> {
        let known: Vec<String> = self
            .adapter
            .peripherals()
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?
            .iter()
            .map(|p| p.id().to_string())
            .collect();
        Ok(ids.iter().all(|id| known.contains(&id.0)))
    }

    async fn lookup(&self, id: &StripId) -> Result<Option<Peripheral>, LinkError> {
        for p in self
            .adapter
            .peripherals()
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?
        {
            if p.id().to_string() == id.0 {
                return Ok(Some(p));
            }
        }
        Ok(None)
    }

    /// The connected peripheral for `id`. CoreBluetooth happily "writes" to a peripheral that has gone away
    /// (strip power-cycled, out of range), so a link that is no longer connected is forgotten and reported:
    /// the pool then drops it and reconnects instead of sending into the void.
    async fn cached(&self, id: &StripId) -> Result<Peripheral, LinkError> {
        let p = self
            .peripherals
            .lock()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| LinkError::Write(format!("strip {} is not connected", id.0)))?;
        if p.is_connected().await.unwrap_or(false) {
            return Ok(p);
        }
        self.peripherals.lock().await.remove(id);
        Err(LinkError::Write(format!(
            "strip {} dropped the connection",
            id.0
        )))
    }
}

#[async_trait]
impl Scanner for BleLink {
    async fn scan(&self, duration: Duration) -> Result<Vec<Discovered>, LinkError> {
        BleLink::scan(self, duration).await
    }
}

#[async_trait]
impl Link for BleLink {
    async fn prepare(&self, ids: &[StripId]) {
        let _ = self.scan_for(ids, FIND_SCAN).await;
    }

    async fn powered(&self) -> Option<bool> {
        match self.adapter.adapter_state().await {
            Ok(CentralState::PoweredOn) => Some(true),
            Ok(CentralState::PoweredOff) => Some(false),
            _ => None,
        }
    }

    async fn connect(&self, id: &StripId) -> Result<(), LinkError> {
        let p = self.find(id).await?;
        let established = async {
            tokio::time::timeout(CONNECT_TIMEOUT, p.connect())
                .await
                .map_err(|_| LinkError::Connect("connect timed out".into()))?
                .map_err(|e| LinkError::Connect(e.to_string()))?;
            tokio::time::timeout(DISCOVER_TIMEOUT, p.discover_services())
                .await
                .map_err(|_| LinkError::Connect("service discovery timed out".into()))?
                .map_err(|e| LinkError::Connect(e.to_string()))
        }
        .await;
        if let Err(e) = established {
            // Cancels a pending connect too, so no untracked live connection survives.
            let _ = p.disconnect().await;
            return Err(e);
        }
        self.peripherals.lock().await.insert(id.clone(), p);
        Ok(())
    }

    async fn write(
        &self,
        id: &StripId,
        characteristic: Uuid,
        bytes: &[u8],
    ) -> Result<(), LinkError> {
        let p = self.cached(id).await?;
        let ch = p
            .characteristics()
            .into_iter()
            .find(|c| c.uuid == characteristic)
            .ok_or_else(|| {
                LinkError::Write(format!("characteristic {characteristic} not found"))
            })?;
        let write_type = if ch
            .properties
            .contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
        {
            WriteType::WithoutResponse
        } else {
            WriteType::WithResponse
        };
        tokio::time::timeout(WRITE_TIMEOUT, p.write(&ch, bytes, write_type))
            .await
            .map_err(|_| LinkError::Write("write timed out".into()))?
            .map_err(|e| LinkError::Write(e.to_string()))
    }

    async fn disconnect(&self, id: &StripId) -> Result<(), LinkError> {
        let p = self.peripherals.lock().await.remove(id);
        match p {
            Some(p) => p
                .disconnect()
                .await
                .map_err(|e| LinkError::Disconnect(e.to_string())),
            None => Ok(()),
        }
    }

    async fn services(&self, id: &StripId) -> Result<Vec<Uuid>, LinkError> {
        let p = self
            .cached(id)
            .await
            .map_err(|e| LinkError::Connect(e.to_string()))?;
        Ok(p.services().into_iter().map(|s| s.uuid).collect())
    }
}
