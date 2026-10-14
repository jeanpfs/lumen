use serde::{Deserialize, Serialize};

/// Platform identifier of a strip (CoreBluetooth UUID on macOS, MAC address elsewhere).
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct StripId(pub String);

impl StripId {
    pub fn new(s: &str) -> Self {
        Self(s.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct GroupId(pub String);

impl GroupId {
    pub fn new(s: &str) -> Self {
        Self(s.to_string())
    }
}
