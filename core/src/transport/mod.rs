//! Link abstraction over a BLE central. One implementation per platform plus a fake for tests.

use crate::ids::StripId;
use async_trait::async_trait;
use serde::Serialize;
use std::time::Duration;
use uuid::Uuid;

#[cfg(feature = "ble")]
pub mod ble;
#[cfg(test)]
pub mod fake;

#[derive(Debug, thiserror::Error)]
pub enum LinkError {
    #[error("connect failed: {0}")]
    Connect(String),
    #[error("write failed: {0}")]
    Write(String),
    #[error("disconnect failed: {0}")]
    Disconnect(String),
}

/// One BLE device seen during a scan.
#[derive(Debug, Clone, Serialize)]
pub struct Discovered {
    pub id: StripId,
    pub name: Option<String>,
    pub rssi: Option<i16>,
    pub services: Vec<Uuid>,
}

#[async_trait]
pub trait Scanner: Send + Sync {
    /// Scans for `duration` and returns everything seen, strongest signal first.
    async fn scan(&self, duration: Duration) -> Result<Vec<Discovered>, LinkError>;
}

#[async_trait]
pub trait Link: Send + Sync {
    /// Gets ready to connect to `ids` quickly (a platform may have to see them advertise first).
    /// Best effort: a failure here only means the first `connect` pays the cost.
    async fn prepare(&self, _ids: &[StripId]) {}
    /// Whether the Bluetooth radio is on; `None` when the platform cannot tell.
    async fn powered(&self) -> Option<bool> {
        None
    }
    async fn connect(&self, id: &StripId) -> Result<(), LinkError>;
    async fn write(
        &self,
        id: &StripId,
        characteristic: Uuid,
        bytes: &[u8],
    ) -> Result<(), LinkError>;
    async fn disconnect(&self, id: &StripId) -> Result<(), LinkError>;
    /// GATT services the strip exposes. The strip must be connected.
    async fn services(&self, id: &StripId) -> Result<Vec<Uuid>, LinkError>;
}
