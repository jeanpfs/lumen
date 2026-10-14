//! Catalogue of known wire protocols. `mrstar` is confirmed on hardware; the `7E … EF`
//! variants come from the elkbledom Home Assistant integration's models.json and are
//! UNVERIFIED on real strips until the setup wizard has confirmed them.

use crate::calibration::{hsv_to_rgb, Calibration, Capabilities};
use crate::protocol::{Command, MrStar, Profile};
use std::sync::Arc;
use uuid::Uuid;

/// Frame template: plain bytes (0..=255) plus the placeholders below.
type Frame = &'static [u16];
const R: u16 = 0x100;
const G: u16 = 0x101;
const B: u16 = 0x102;
/// Brightness as a percentage, 1..=100.
const I: u16 = 0x103;

pub struct Variant {
    pub id: &'static str,
    /// Advertised-name prefixes (upper case) that suggest this variant.
    pub names: &'static [&'static str],
    pub service: u16,
    pub write: u16,
    pub on: Frame,
    pub off: Frame,
    pub color: Option<Frame>,
    pub brightness: Option<Frame>,
}

const fn uuid16(short: u16) -> Uuid {
    Uuid::from_u128(((short as u128) << 96) | 0x0000_1000_8000_0080_5f9b_34fb)
}

pub static VARIANTS: &[Variant] = &[
    Variant {
        id: "elk-btc",
        names: &["ELK-BTC"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x0A, 0xEF]),
        brightness: Some(&[0x7E, 0x00, 0x01, I, 0x00, 0x00, 0x00, 0x00, 0xEF]),
    },
    Variant {
        id: "elk-btcw",
        names: &["ELK-BTCW"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: None,
        brightness: Some(&[0x7E, 0x00, 0x01, I, 0x00, 0x00, 0x00, 0x00, 0xEF]),
    },
    Variant {
        id: "elk-bledob",
        names: &["ELK-BLEDOB", "ELK-BLEDOM0E"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x07, 0x04, 0xFF, 0x00, 0x01, 0x02, 0x01, 0xEF],
        off: &[0x7E, 0x07, 0x04, 0x00, 0x00, 0x00, 0x02, 0x01, 0xEF],
        color: Some(&[0x7E, 0x07, 0x05, 0x03, R, G, B, 0x0A, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0x01, 0xFF, 0x02, 0x01, 0xEF]),
    },
    Variant {
        id: "elk-bleddm",
        names: &["ELK-BLEDDM"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x04, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x04, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0xFF, 0x00, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "elk-bledom-a",
        names: &["ELK-BLEDOM"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x04, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x04, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: Some(&[0x7E, 0x07, 0x05, 0x03, R, G, B, 0x0A, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0x01, 0xFF, 0x02, 0x01, 0xEF]),
    },
    Variant {
        id: "elk-bledom-b",
        names: &["ELK-BLEDOM"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x00, 0x01, I, 0xFF, 0x00, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "elk-ble",
        names: &["ELK-BLE"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0xFF, 0x00, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "ledble",
        names: &["LEDBLE"],
        service: 0xFFE0,
        write: 0xFFE1,
        on: &[0x7E, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0xEF],
        off: &[0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0xFF, 0x00, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "led-jackyled",
        names: &["LED-", "JACKYLED"],
        service: 0xFFE0,
        write: 0xFFE1,
        on: &[0x7E, 0x04, 0x04, 0x01, 0xFF, 0xFF, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0xEF],
        // This model takes the green and blue bytes swapped.
        color: Some(&[0x7E, 0x07, 0x05, 0x03, R, B, G, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0xFF, 0xFF, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "xrocker",
        names: &["XROCKER"],
        service: 0xFFE0,
        write: 0xFFE1,
        on: &[0x7B, 0xFF, 0x04, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xBF],
        off: &[0x7B, 0xFF, 0x04, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xBF],
        color: Some(&[0x7B, 0xFF, 0x05, 0x03, R, G, B, 0xFF, 0xBF]),
        brightness: Some(&[0x7B, 0x04, 0x01, I, 0xFF, 0xFF, 0xFF, 0xFF, 0xBF]),
    },
    Variant {
        id: "melk-og10",
        names: &["MELK-OG10"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x07, 0x04, 0xFF, 0x00, 0x01, 0x02, 0x01, 0xEF],
        off: &[0x7E, 0x07, 0x04, 0x00, 0x00, 0x00, 0x02, 0x00, 0xEF],
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0xFF, 0x00, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "melk-o-series",
        names: &["MELK-OF10", "MELK-OC10", "MELK-OA10", "MELK-OA21"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x04, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x04, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0x01, 0xFF, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "melk-bulb",
        names: &["MELK", "ELK-BULB", "ELK-LAMPL"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0xEF],
        off: &[0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0xFF, 0x00, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "elk-bulb2",
        names: &["ELK-BULB2"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x00, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0xEF], // exactly as published in upstream models.json; equals on frame of ledble/melk-bulb; kept unverified
        color: Some(&[0x7E, 0x00, 0x05, 0x03, R, G, B, 0x00, 0xEF]),
        brightness: Some(&[0x7E, 0x04, 0x01, I, 0xFF, 0x00, 0xFF, 0x00, 0xEF]),
    },
    Variant {
        id: "xsl",
        names: &["XSL-", "LED LIGHT STRIP"],
        service: 0xFFF0,
        write: 0xFFF3,
        on: &[0x7E, 0x04, 0x04, 0x01, 0x00, 0x01, 0xFF, 0x00, 0xEF],
        off: &[0x7E, 0x04, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF],
        color: None,
        brightness: None,
    },
];

/// A `Variant` as a `Profile`.
pub struct TemplateProfile(&'static Variant);

fn fill(frame: Frame, rgb: [u8; 3], percent: u8) -> Vec<u8> {
    frame
        .iter()
        .map(|&t| match t {
            R => rgb[0],
            G => rgb[1],
            B => rgb[2],
            I => percent,
            plain => plain as u8,
        })
        .collect()
}

impl Profile for TemplateProfile {
    fn id(&self) -> &'static str {
        self.0.id
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            color: self.0.color.is_some(),
            brightness: self.0.brightness.is_some(),
            ..Capabilities::default()
        }
    }

    fn service(&self) -> Uuid {
        uuid16(self.0.service)
    }

    fn write_characteristic(&self) -> Uuid {
        uuid16(self.0.write)
    }

    fn name_match_len(&self, advertised_name: &str) -> usize {
        let name = advertised_name.to_ascii_uppercase();
        self.0
            .names
            .iter()
            .filter(|p| name.starts_with(**p))
            .map(|p| p.len())
            .max()
            .unwrap_or(0)
    }

    fn encode(&self, cmd: &Command, cal: &Calibration) -> Option<Vec<u8>> {
        match *cmd {
            Command::Power(true) => Some(fill(self.0.on, [0; 3], 0)),
            Command::Power(false) => Some(fill(self.0.off, [0; 3], 0)),
            Command::Color { hue, sat } => {
                let rgb = cal.channel_order.apply(hsv_to_rgb(hue, sat));
                self.0.color.map(|f| fill(f, rgb, 0))
            }
            Command::Brightness(v) => {
                let lo = cal.min_brightness.clamp(3, 1000);
                let v = v.clamp(lo, 1000);
                let percent = (v / 10).clamp(1, 100) as u8;
                self.0.brightness.map(|f| fill(f, [0; 3], percent))
            }
            // No verified effect frames for the `7E … EF` variants.
            Command::Effect(_) | Command::Speed(_) | Command::Direction(_) => None,
        }
    }
}

/// Every known profile: `mrstar` first, then the template variants in table order.
pub fn all_profiles() -> Vec<Arc<dyn Profile>> {
    let mut out: Vec<Arc<dyn Profile>> = vec![Arc::new(MrStar)];
    out.extend(
        VARIANTS
            .iter()
            .map(|v| Arc::new(TemplateProfile(v)) as Arc<dyn Profile>),
    );
    out
}

pub fn profile_by_id(id: &str) -> Option<Arc<dyn Profile>> {
    all_profiles().into_iter().find(|p| p.id() == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calibration::ChannelOrder;
    use std::collections::HashSet;

    fn profile(id: &str) -> Arc<dyn Profile> {
        profile_by_id(id).unwrap_or_else(|| panic!("no profile {id}"))
    }

    #[test]
    fn profile_ids_are_unique_and_lookup_works() {
        let ids: Vec<&str> = all_profiles().iter().map(|p| p.id()).collect();
        let unique: HashSet<&&str> = ids.iter().collect();
        assert_eq!(ids.len(), unique.len(), "duplicate profile id");
        assert_eq!(profile_by_id("mrstar").unwrap().id(), "mrstar");
        assert!(profile_by_id("nope").is_none());
    }

    #[test]
    fn every_frame_is_nine_bytes() {
        for v in VARIANTS {
            for frame in [Some(v.on), Some(v.off), v.color, v.brightness]
                .into_iter()
                .flatten()
            {
                assert_eq!(frame.len(), 9, "{}", v.id);
            }
        }
    }

    #[test]
    fn elk_bledom_a_frames_match_the_published_table() {
        let p = profile("elk-bledom-a");
        let cal = Calibration::default();
        assert_eq!(
            p.encode(&Command::Power(true), &cal).unwrap(),
            [0x7E, 0x04, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF]
        );
        assert_eq!(
            p.encode(&Command::Power(false), &cal).unwrap(),
            [0x7E, 0x04, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF]
        );
        // red: 7E 07 05 03 r g b 0A EF
        assert_eq!(
            p.encode(&Command::Color { hue: 0, sat: 1000 }, &cal)
                .unwrap(),
            [0x7E, 0x07, 0x05, 0x03, 0xFF, 0x00, 0x00, 0x0A, 0xEF]
        );
        // 50.0 % -> 0x32: 7E 04 01 i 01 FF 02 01 EF
        assert_eq!(
            p.encode(&Command::Brightness(500), &cal).unwrap(),
            [0x7E, 0x04, 0x01, 0x32, 0x01, 0xFF, 0x02, 0x01, 0xEF]
        );
    }

    #[test]
    fn template_variants_have_no_effect_frames_yet() {
        let cal = Calibration::default();
        for v in VARIANTS {
            let p = profile(v.id);
            assert!(!p.capabilities().effects, "{}", v.id);
            assert_eq!(p.encode(&Command::Effect(1), &cal), None, "{}", v.id);
            assert_eq!(p.encode(&Command::Speed(50), &cal), None, "{}", v.id);
        }
    }

    #[test]
    fn channel_order_is_applied_to_rgb_bytes() {
        let cal = Calibration {
            channel_order: ChannelOrder::Grb,
            ..Calibration::default()
        };
        // logical red on a GRB strip goes out as [0x00, 0xFF, 0x00]
        assert_eq!(
            profile("elk-bledom-a")
                .encode(&Command::Color { hue: 0, sat: 1000 }, &cal)
                .unwrap(),
            [0x7E, 0x07, 0x05, 0x03, 0x00, 0xFF, 0x00, 0x0A, 0xEF]
        );
    }

    #[test]
    fn a_model_with_built_in_swapped_channels_keeps_its_own_template_order() {
        // led-jackyled: template R B G, so green (hue 120) lands in the third slot.
        assert_eq!(
            profile("led-jackyled")
                .encode(
                    &Command::Color {
                        hue: 120,
                        sat: 1000
                    },
                    &Calibration::default()
                )
                .unwrap(),
            [0x7E, 0x07, 0x05, 0x03, 0x00, 0x00, 0xFF, 0x00, 0xEF]
        );
    }

    #[test]
    fn unsupported_commands_return_none_and_capabilities_say_so() {
        let xsl = profile("xsl");
        let cal = Calibration::default();
        assert!(xsl
            .encode(&Command::Color { hue: 0, sat: 1000 }, &cal)
            .is_none());
        assert!(xsl.encode(&Command::Brightness(500), &cal).is_none());
        assert!(xsl.encode(&Command::Power(true), &cal).is_some());
        assert_eq!(
            (xsl.capabilities().color, xsl.capabilities().brightness),
            (false, false)
        );
        assert!(profile("elk-bledom-a").capabilities().color);
    }

    #[test]
    fn brightness_percent_is_clamped_to_1_and_100_and_honours_the_calibrated_minimum() {
        let p = profile("elk-bledom-a");
        let cal = Calibration::default();
        // 1000 -> 100 % = 0x64; 3 -> 0 % raised to 1 % = 0x01
        assert_eq!(p.encode(&Command::Brightness(1000), &cal).unwrap()[3], 0x64);
        assert_eq!(p.encode(&Command::Brightness(3), &cal).unwrap()[3], 0x01);
        let raised = Calibration {
            min_brightness: 200,
            ..cal
        };
        assert_eq!(p.encode(&Command::Brightness(30), &raised).unwrap()[3], 20);
    }

    #[test]
    fn xrocker_uses_the_0x7b_framing_and_the_ffe1_characteristic() {
        let p = profile("xrocker");
        assert_eq!(
            p.encode(&Command::Power(true), &Calibration::default())
                .unwrap(),
            [0x7B, 0xFF, 0x04, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xBF]
        );
        assert_eq!(p.write_characteristic(), uuid16(0xFFE1));
        assert_eq!(p.service(), uuid16(0xFFE0));
    }

    #[test]
    fn name_matching_picks_the_longest_prefix() {
        assert_eq!(profile("elk-bledom-a").name_match_len("ELK-BLEDOM"), 10);
        assert_eq!(profile("elk-bledob").name_match_len("ELK-BLEDOM0E"), 12);
        assert_eq!(profile("elk-bledob").name_match_len("something else"), 0);
    }

    #[test]
    fn an_out_of_range_calibrated_minimum_does_not_panic() {
        let p = profile("elk-bledom-a");
        let cal = Calibration {
            min_brightness: 2000,
            ..Calibration::default()
        };
        // Must not panic; should clamp both min and value to 1000
        let result = p.encode(&Command::Brightness(500), &cal).unwrap();
        let encoded_1000 = p
            .encode(&Command::Brightness(1000), &Calibration::default())
            .unwrap();
        assert_eq!(result, encoded_1000, "should encode as 1000");
    }

    #[test]
    fn every_template_is_well_formed() {
        use std::collections::HashSet;
        let mut ids = HashSet::new();
        for v in VARIANTS {
            // Variant ID is unique
            assert!(ids.insert(v.id), "duplicate variant id: {}", v.id);
            // On/off frames have no placeholders and all values <= 0xFF
            for &byte in v.on {
                assert!(
                    byte <= 0xFF,
                    "on frame byte 0x{:X} > 0xFF in {}",
                    byte,
                    v.id
                );
            }
            for &byte in v.off {
                assert!(
                    byte <= 0xFF,
                    "off frame byte 0x{:X} > 0xFF in {}",
                    byte,
                    v.id
                );
            }
            // Colour frame has R, G, B exactly once each
            if let Some(color) = v.color {
                let r_count = color.iter().filter(|&&b| b == R).count();
                let g_count = color.iter().filter(|&&b| b == G).count();
                let b_count = color.iter().filter(|&&b| b == B).count();
                assert_eq!(r_count, 1, "color frame has {} R in {}", r_count, v.id);
                assert_eq!(g_count, 1, "color frame has {} G in {}", g_count, v.id);
                assert_eq!(b_count, 1, "color frame has {} B in {}", b_count, v.id);
                assert!(!color.contains(&I), "color frame has I in {}", v.id);
                for &byte in color {
                    assert!(
                        byte <= 0xFF || byte == R || byte == G || byte == B,
                        "color frame has invalid value 0x{:X} in {}",
                        byte,
                        v.id
                    );
                }
            }
            // Brightness frame has I exactly once
            if let Some(brightness) = v.brightness {
                let i_count = brightness.iter().filter(|&&b| b == I).count();
                assert_eq!(i_count, 1, "brightness frame has {} I in {}", i_count, v.id);
                assert!(
                    !brightness.iter().any(|&b| matches!(b, R | G | B)),
                    "brightness frame has RGB in {}",
                    v.id
                );
                for &byte in brightness {
                    assert!(
                        byte <= 0xFF || byte == I,
                        "brightness frame has invalid value 0x{:X} in {}",
                        byte,
                        v.id
                    );
                }
            }
        }
    }
}
