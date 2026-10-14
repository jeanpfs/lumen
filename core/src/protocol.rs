//! Pure command encoding. No I/O.

use crate::calibration::{Calibration, Capabilities};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const START: u8 = 0xBC;
const END: u8 = 0x55;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum Command {
    Power(bool),
    /// `hue` 0..=360 degrees, `sat` 0..=1000. Out-of-range values are clamped.
    Color {
        hue: u16,
        sat: u16,
    },
    /// 1..=1000. Raised to the strip's calibrated minimum (never below 3).
    Brightness(u16),
    /// A built-in effect, by its mode number (1..=117).
    /// Plays until another colour or effect arrives.
    Effect(u16),
    /// Speed of the running built-in effect, 1..=100. Raised to 1.
    Speed(u8),
    /// Direction of the running built-in effect. `true` goes out as 0; which way that
    /// runs is not documented.
    Direction(bool),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CommandKind {
    Power,
    Color,
    Brightness,
    Effect,
    Speed,
    Direction,
}

impl Command {
    pub fn kind(&self) -> CommandKind {
        match *self {
            Self::Power(_) => CommandKind::Power,
            Self::Color { .. } => CommandKind::Color,
            Self::Brightness(_) => CommandKind::Brightness,
            Self::Effect(_) => CommandKind::Effect,
            Self::Speed(_) => CommandKind::Speed,
            Self::Direction(_) => CommandKind::Direction,
        }
    }
}

/// One wire protocol (a family or a model variant of one).
pub trait Profile: Send + Sync {
    fn id(&self) -> &'static str;
    fn capabilities(&self) -> Capabilities;
    fn service(&self) -> Uuid;
    fn write_characteristic(&self) -> Uuid;
    /// Length of the longest advertised-name prefix this profile claims; 0 when none matches.
    /// Used only to rank candidates, never to decide.
    fn name_match_len(&self, advertised_name: &str) -> usize;
    /// `None` when the profile cannot express the command (see `capabilities`).
    fn encode(&self, cmd: &Command, cal: &Calibration) -> Option<Vec<u8>>;
}

/// MR Star family: service FFF0, write FFF3, frame `BC [cmd len params..] 55`.
/// Colour is sent as hue/saturation, so the controller resolves the channel order itself.
pub struct MrStar;

impl Profile for MrStar {
    fn id(&self) -> &'static str {
        "mrstar"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            color: true,
            brightness: true,
            effects: true,
            ..Capabilities::default()
        }
    }

    fn service(&self) -> Uuid {
        Uuid::from_u128(0x0000fff0_0000_1000_8000_00805f9b34fb)
    }

    fn write_characteristic(&self) -> Uuid {
        Uuid::from_u128(0x0000fff3_0000_1000_8000_00805f9b34fb)
    }

    fn name_match_len(&self, advertised_name: &str) -> usize {
        const PREFIX: &str = "GATT--DEMO";
        if advertised_name.to_ascii_uppercase().starts_with(PREFIX) {
            PREFIX.len()
        } else {
            0
        }
    }

    fn encode(&self, cmd: &Command, cal: &Calibration) -> Option<Vec<u8>> {
        let body: Vec<u8> = match *cmd {
            Command::Power(on) => vec![0x01, 0x01, on as u8],
            Command::Color { hue, sat } => {
                let h = hue.min(360);
                let s = sat.min(1000);
                vec![
                    0x04,
                    0x06,
                    (h >> 8) as u8,
                    h as u8,
                    (s >> 8) as u8,
                    s as u8,
                    0x00,
                    0x00,
                ]
            }
            Command::Brightness(v) => {
                let lo = cal.min_brightness.clamp(3, 1000);
                let v = v.clamp(lo, 1000);
                vec![0x05, 0x06, (v >> 8) as u8, v as u8, 0x00, 0x00, 0x00, 0x00]
            }
            // The number is split by 255, not 256 (`n / 255`, `n % 255`); the numbers are all
            // below 255, so both give `[0, n]`.
            Command::Effect(n) => vec![0x06, 0x02, (n / 255) as u8, (n % 255) as u8],
            Command::Speed(v) => vec![0x08, 0x01, v.clamp(1, 100)],
            Command::Direction(on) => vec![0x07, 0x01, !on as u8],
        };
        let mut out = Vec::with_capacity(body.len() + 2);
        out.push(START);
        out.extend(body);
        out.push(END);
        Some(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn enc(cmd: Command) -> Vec<u8> {
        MrStar.encode(&cmd, &Calibration::default()).unwrap()
    }

    #[test]
    fn power_on_and_off() {
        assert_eq!(enc(Command::Power(true)), [0xBC, 0x01, 0x01, 0x01, 0x55]);
        assert_eq!(enc(Command::Power(false)), [0xBC, 0x01, 0x01, 0x00, 0x55]);
    }

    #[test]
    fn effect_speed_and_direction_frames() {
        // frame layouts: BC 06 02 hi lo 55 / BC 08 01 speed 55 / BC 07 01 dir 55
        assert_eq!(
            enc(Command::Effect(35)),
            [0xBC, 0x06, 0x02, 0x00, 0x23, 0x55]
        );
        assert_eq!(
            enc(Command::Effect(117)),
            [0xBC, 0x06, 0x02, 0x00, 0x75, 0x55]
        );
        assert_eq!(enc(Command::Speed(50)), [0xBC, 0x08, 0x01, 0x32, 0x55]);
        assert_eq!(enc(Command::Speed(0)), [0xBC, 0x08, 0x01, 0x01, 0x55]);
        assert_eq!(enc(Command::Speed(250)), [0xBC, 0x08, 0x01, 0x64, 0x55]);
        assert_eq!(
            enc(Command::Direction(true)),
            [0xBC, 0x07, 0x01, 0x00, 0x55]
        );
        assert_eq!(
            enc(Command::Direction(false)),
            [0xBC, 0x07, 0x01, 0x01, 0x55]
        );
    }

    #[test]
    fn color_encodes_hue_and_saturation_big_endian() {
        // hue 120 = 0x0078, sat 1000 = 0x03E8
        assert_eq!(
            enc(Command::Color {
                hue: 120,
                sat: 1000
            }),
            [0xBC, 0x04, 0x06, 0x00, 0x78, 0x03, 0xE8, 0x00, 0x00, 0x55]
        );
    }

    #[test]
    fn color_clamps_out_of_range() {
        // hue 400 -> 360 = 0x0168, sat 5000 -> 1000 = 0x03E8
        assert_eq!(
            enc(Command::Color {
                hue: 400,
                sat: 5000
            }),
            [0xBC, 0x04, 0x06, 0x01, 0x68, 0x03, 0xE8, 0x00, 0x00, 0x55]
        );
    }

    #[test]
    fn brightness_encodes_and_clamps_to_min_3() {
        assert_eq!(
            enc(Command::Brightness(500)),
            [0xBC, 0x05, 0x06, 0x01, 0xF4, 0x00, 0x00, 0x00, 0x00, 0x55]
        );
        assert_eq!(
            enc(Command::Brightness(1)),
            [0xBC, 0x05, 0x06, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x55]
        );
    }

    #[test]
    fn brightness_is_raised_to_the_calibrated_minimum() {
        let cal = Calibration {
            min_brightness: 100,
            ..Calibration::default()
        };
        // 30 is below the strip's measured minimum of 100 (0x0064).
        assert_eq!(
            MrStar.encode(&Command::Brightness(30), &cal).unwrap(),
            [0xBC, 0x05, 0x06, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x55]
        );
    }

    #[test]
    fn an_out_of_range_calibrated_minimum_does_not_panic() {
        let cal = Calibration {
            min_brightness: 2000,
            ..Calibration::default()
        };
        // Must not panic; should clamp both min and value to 1000
        let result = MrStar.encode(&Command::Brightness(500), &cal).unwrap();
        let encoded_1000 = MrStar
            .encode(&Command::Brightness(1000), &Calibration::default())
            .unwrap();
        assert_eq!(result, encoded_1000, "should encode as 1000");
    }

    #[test]
    fn name_match_is_a_case_insensitive_prefix() {
        assert_eq!(MrStar.name_match_len("gatt--demo"), 10);
        assert_eq!(MrStar.name_match_len("ELK-BLEDOM"), 0);
    }
}
