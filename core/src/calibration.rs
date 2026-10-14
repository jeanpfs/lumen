//! What a profile can do (`Capabilities`) and what the setup wizard measured on one
//! physical strip (`Calibration`). Pure data and pure functions.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Capabilities {
    pub color: bool,
    pub brightness: bool,
    pub white: bool,
    pub effects: bool,
    pub microphone: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Channel {
    Red,
    Green,
    Blue,
}

/// Order in which the strip expects the three colour bytes on the wire.
/// `Grb` means the first byte drives green, the second red, the third blue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum ChannelOrder {
    #[default]
    Rgb,
    Rbg,
    Grb,
    Gbr,
    Brg,
    Bgr,
}

impl ChannelOrder {
    /// `None` unless the three channels are a permutation of red, green, blue.
    pub fn from_channels(channels: [Channel; 3]) -> Option<Self> {
        use Channel::{Blue as B, Green as G, Red as R};
        match channels {
            [R, G, B] => Some(Self::Rgb),
            [R, B, G] => Some(Self::Rbg),
            [G, R, B] => Some(Self::Grb),
            [G, B, R] => Some(Self::Gbr),
            [B, R, G] => Some(Self::Brg),
            [B, G, R] => Some(Self::Bgr),
            _ => None,
        }
    }

    /// Reorders logical `[r, g, b]` into the order the strip expects on the wire.
    pub fn apply(self, rgb: [u8; 3]) -> [u8; 3] {
        let [r, g, b] = rgb;
        match self {
            Self::Rgb => [r, g, b],
            Self::Rbg => [r, b, g],
            Self::Grb => [g, r, b],
            Self::Gbr => [g, b, r],
            Self::Brg => [b, r, g],
            Self::Bgr => [b, g, r],
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Calibration {
    pub channel_order: ChannelOrder,
    /// Lowest brightness (1..=1000) at which the strip still lights; commands below it are raised to it.
    pub min_brightness: u16,
    /// Number of visibly different brightness levels found by the wizard (0 = not measured).
    pub steps: u8,
    pub has_white: bool,
}

impl Default for Calibration {
    fn default() -> Self {
        Self {
            channel_order: ChannelOrder::Rgb,
            min_brightness: 3,
            steps: 0,
            has_white: false,
        }
    }
}

/// Full-value HSV to RGB. `hue` 0..=360 (360 wraps to 0), `sat` 0..=1000. Out-of-range input is clamped.
pub fn hsv_to_rgb(hue: u16, sat: u16) -> [u8; 3] {
    let h = (hue.min(360) % 360) as f32;
    let s = sat.min(1000) as f32 / 1000.0;
    let c = s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = 1.0 - c;
    let (r, g, b) = match (h / 60.0) as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let to_byte = |v: f32| ((v + m) * 255.0).round() as u8;
    [to_byte(r), to_byte(g), to_byte(b)]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hsv_primaries_and_white() {
        assert_eq!(hsv_to_rgb(0, 1000), [255, 0, 0]);
        assert_eq!(hsv_to_rgb(120, 1000), [0, 255, 0]);
        assert_eq!(hsv_to_rgb(240, 1000), [0, 0, 255]);
        assert_eq!(hsv_to_rgb(60, 1000), [255, 255, 0]);
        assert_eq!(hsv_to_rgb(200, 0), [255, 255, 255]);
    }

    #[test]
    fn hsv_wraps_360_and_clamps() {
        assert_eq!(hsv_to_rgb(360, 1000), [255, 0, 0]);
        assert_eq!(hsv_to_rgb(999, 5000), hsv_to_rgb(360, 1000));
    }

    #[test]
    fn channel_order_apply_puts_each_channel_in_its_wire_slot() {
        let rgb = [10, 20, 30];
        assert_eq!(ChannelOrder::Rgb.apply(rgb), [10, 20, 30]);
        assert_eq!(ChannelOrder::Grb.apply(rgb), [20, 10, 30]);
        assert_eq!(ChannelOrder::Bgr.apply(rgb), [30, 20, 10]);
        assert_eq!(ChannelOrder::Brg.apply(rgb), [30, 10, 20]);
    }

    #[test]
    fn channel_order_from_channels_accepts_only_permutations() {
        use Channel::{Blue, Green, Red};
        assert_eq!(
            ChannelOrder::from_channels([Green, Red, Blue]),
            Some(ChannelOrder::Grb)
        );
        assert_eq!(ChannelOrder::from_channels([Red, Red, Blue]), None);
    }

    #[test]
    fn default_calibration_is_neutral() {
        let c = Calibration::default();
        assert_eq!(
            (c.channel_order, c.min_brightness, c.steps, c.has_white),
            (ChannelOrder::Rgb, 3, 0, false)
        );
    }
}
