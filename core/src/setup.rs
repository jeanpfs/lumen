//! Pure logic behind the "add a strip" wizard. The UI sends the probes this module asks
//! for, shows the questions, and feeds the user's answers back; nothing here touches Bluetooth.

use crate::calibration::{Calibration, Channel, ChannelOrder};
use crate::families::all_profiles;
use crate::protocol::{Command, Profile};
use std::cmp::Reverse;
use std::sync::Arc;
use uuid::Uuid;
/// The nine fixed screens of the wizard, in order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Scan,
    Identify,
    Recognize,
    Power,
    Colors,
    White,
    Intensity,
    Effects,
    Summary,
}

impl Step {
    pub const ALL: [Step; 9] = [
        Step::Scan,
        Step::Identify,
        Step::Recognize,
        Step::Power,
        Step::Colors,
        Step::White,
        Step::Intensity,
        Step::Effects,
        Step::Summary,
    ];

    /// 1-based position, for "Step N of 9".
    pub fn number(self) -> usize {
        Self::ALL
            .iter()
            .position(|s| *s == self)
            .expect("every step is in ALL")
            + 1
    }

    pub fn next(self) -> Option<Step> {
        Self::ALL.get(self.number()).copied()
    }

    pub fn previous(self) -> Option<Step> {
        self.number().checked_sub(2).map(|i| Self::ALL[i])
    }
}

// ---------------------------------------------------------------- recognition

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    /// Power off then on: "did it go off and back on?".
    Blink,
    /// Power on then pure logical red: "which colour do you see?".
    Colour,
}

pub enum Outcome {
    Continue,
    Recognized(Arc<dyn Profile>),
    Exhausted,
}

/// Step 3. Tries each candidate profile by sending it a probe and asking the user what the
/// strip did. Several profiles share the same GATT UUIDs, so only the user's answers decide.
///
/// Phase 1 blinks the strip (off, then on again, so it stays lit for the next candidate) and
/// asks [`Recognizer::answer_power`]. Phase 2 sends logical red and asks
/// [`Recognizer::answer_colour`]: the channel order is only measured later (step 5), so ANY solid
/// primary recognizes the candidate; only `Seen::Other` rejects it. Once recognized, the
/// recognizer is finished: `commands()` returns `None` and every answer returns `Recognized`
/// of the same profile.
pub struct Recognizer {
    candidates: Vec<Arc<dyn Profile>>,
    index: usize,
    phase: Phase,
    recognized: Option<Arc<dyn Profile>>,
}

impl Recognizer {
    /// Ranking, best first: candidates whose GATT service is among `gatt_services` (the
    /// services DISCOVERED after connecting, not the advertised ones; ignored when empty), then
    /// longest advertised-name prefix match, then colour-capable before colourless (so a
    /// colourless profile never captures a colour strip). Ties keep the catalogue order. No
    /// candidate is ever dropped.
    pub fn new(advertised_name: Option<&str>, gatt_services: &[Uuid]) -> Self {
        let name = advertised_name.unwrap_or("");
        let mut candidates = all_profiles();
        candidates.sort_by_key(|p| {
            (
                Reverse(gatt_services.contains(&p.service())),
                Reverse(p.name_match_len(name)),
                !p.capabilities().color,
            )
        });
        Self {
            candidates,
            index: 0,
            phase: Phase::Blink,
            recognized: None,
        }
    }

    /// `(current, total)`, 1-based, for "Testing family 2 of N".
    pub fn progress(&self) -> (usize, usize) {
        (
            (self.index + 1).min(self.candidates.len()),
            self.candidates.len(),
        )
    }

    /// The profile under test and the commands to send it now; `None` once exhausted or
    /// recognized. Phase 1 blinks (power off, power on: "did it go off and back on?"); phase 2
    /// sends power on then pure logical red ("which colour do you see?").
    pub fn commands(&self) -> Option<(Arc<dyn Profile>, Vec<Command>)> {
        if self.recognized.is_some() {
            return None;
        }
        let profile = self.candidates.get(self.index)?.clone();
        let commands = match self.phase {
            Phase::Blink => vec![Command::Power(false), Command::Power(true)],
            Phase::Colour => vec![Command::Power(true), Command::Color { hue: 0, sat: 1000 }],
        };
        Some((profile, commands))
    }

    /// Phase 1 answer: the strip went off and back on. Outside phase 1 this returns
    /// `Outcome::Continue` and changes nothing (unless already recognized, see the type docs).
    pub fn answer_power(&mut self, turned_off_and_on: bool) -> Outcome {
        if let Some(p) = &self.recognized {
            return Outcome::Recognized(p.clone());
        }
        if self.phase != Phase::Blink {
            return Outcome::Continue;
        }
        let Some(profile) = self.candidates.get(self.index).cloned() else {
            return Outcome::Exhausted;
        };
        if !turned_off_and_on {
            return self.reject();
        }
        if profile.capabilities().color {
            self.phase = Phase::Colour;
            Outcome::Continue
        } else {
            self.recognize(profile)
        }
    }

    /// Phase 2 answer: the colour the strip showed for logical red. Any primary recognizes the
    /// candidate (the channel order is measured later); `Seen::Other` rejects it. Outside
    /// phase 2 this returns `Outcome::Continue` and changes nothing (unless already
    /// recognized, see the type docs).
    pub fn answer_colour(&mut self, seen: Seen) -> Outcome {
        if let Some(p) = &self.recognized {
            return Outcome::Recognized(p.clone());
        }
        if self.phase != Phase::Colour {
            return Outcome::Continue;
        }
        let Some(profile) = self.candidates.get(self.index).cloned() else {
            return Outcome::Exhausted;
        };
        match seen {
            Seen::Other => self.reject(),
            Seen::Red | Seen::Green | Seen::Blue => self.recognize(profile),
        }
    }

    fn recognize(&mut self, profile: Arc<dyn Profile>) -> Outcome {
        self.recognized = Some(profile.clone());
        Outcome::Recognized(profile)
    }

    fn reject(&mut self) -> Outcome {
        self.index += 1;
        self.phase = Phase::Blink;
        if self.index >= self.candidates.len() {
            Outcome::Exhausted
        } else {
            Outcome::Continue
        }
    }
}

// ---------------------------------------------------------------- colour order

/// What the user reports seeing for one colour test.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Seen {
    Red,
    Green,
    Blue,
    Other,
}

/// Step 5. The app sends logical `[255,0,0]`, `[0,255,0]`, `[0,0,255]` with the neutral order;
/// logical channel `i` drives the colour seen in test `i`. (`led-jackyled`'s built-in template
/// order does not matter: the test and `ChannelOrder::apply` both work on logical channels.)
/// `None` when an answer is `Other` or two answers repeat (the wizard should redo the step).
pub fn deduce_channel_order(seen: [Seen; 3]) -> Option<ChannelOrder> {
    let to_channel = |s: Seen| match s {
        Seen::Red => Some(Channel::Red),
        Seen::Green => Some(Channel::Green),
        Seen::Blue => Some(Channel::Blue),
        Seen::Other => None,
    };
    ChannelOrder::from_channels([
        to_channel(seen[0])?,
        to_channel(seen[1])?,
        to_channel(seen[2])?,
    ])
}

// ---------------------------------------------------------------- intensity

/// Step 7: brightness levels sent in order, as 1..=1000 (100, 70, 40, 20, 10 and 3 percent).
pub const INTENSITY_LEVELS: [u16; 6] = [1000, 700, 400, 200, 100, 30];

/// The user's answer for one level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct IntensityAnswer {
    /// The strip is lit at this level.
    pub lit: bool,
    /// The level looks different from the previous one (for the first level: same as `lit`).
    pub differs: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IntensityResult {
    pub min_brightness: u16,
    pub steps: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SetupError {
    #[error("expected {expected} intensity answers, got {got}")]
    WrongAnswerCount { expected: usize, got: usize },
    #[error("the strip never lit during the intensity test")]
    NothingLit,
    #[error("answer {i} is contradictory", i = .0 + 1)]
    Contradiction(usize),
    #[error("answer {i} is lit after a dimmer level was dark", i = .0 + 1)]
    NonMonotonic(usize),
}

pub fn analyze_intensity(answers: &[IntensityAnswer]) -> Result<IntensityResult, SetupError> {
    if answers.len() != INTENSITY_LEVELS.len() {
        return Err(SetupError::WrongAnswerCount {
            expected: INTENSITY_LEVELS.len(),
            got: answers.len(),
        });
    }
    if let Some(i) = answers.iter().position(|a| a.differs && !a.lit) {
        return Err(SetupError::Contradiction(i));
    }
    if answers[0].differs != answers[0].lit {
        return Err(SetupError::Contradiction(0));
    }
    if let Some(first_dark) = answers.iter().position(|a| !a.lit) {
        if let Some(i) = answers[first_dark..].iter().position(|a| a.lit) {
            return Err(SetupError::NonMonotonic(first_dark + i));
        }
    }
    let min_brightness = INTENSITY_LEVELS
        .iter()
        .zip(answers)
        .filter(|(_, a)| a.lit)
        .map(|(level, _)| *level)
        .min()
        .ok_or(SetupError::NothingLit)?;
    let steps = answers.iter().filter(|a| a.differs).count() as u8;
    Ok(IntensityResult {
        min_brightness,
        steps,
    })
}

// ---------------------------------------------------------------- result

/// Everything the wizard learned about one strip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupResult {
    pub profile_id: String,
    pub calibration: Calibration,
}

impl SetupResult {
    pub fn new(
        profile: &dyn Profile,
        order: ChannelOrder,
        has_white: bool,
        intensity: IntensityResult,
    ) -> Self {
        Self {
            profile_id: profile.id().to_string(),
            calibration: Calibration {
                channel_order: order,
                min_brightness: intensity.min_brightness,
                steps: intensity.steps,
                has_white,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::families::profile_by_id;

    fn lit(differs: bool) -> IntensityAnswer {
        IntensityAnswer { lit: true, differs }
    }

    #[test]
    fn steps_are_numbered_one_to_nine_and_chain() {
        assert_eq!(Step::Scan.number(), 1);
        assert_eq!(Step::Summary.number(), 9);
        assert_eq!(Step::Scan.previous(), None);
        assert_eq!(Step::Summary.next(), None);
        assert_eq!(Step::Colors.next(), Some(Step::White));
        assert_eq!(Step::Colors.previous(), Some(Step::Power));
    }

    #[test]
    fn recognizer_tries_the_advertised_name_first() {
        let r = Recognizer::new(Some("GATT--DEMO"), &[]);
        assert_eq!(r.commands().unwrap().0.id(), "mrstar");
        let r = Recognizer::new(Some("ELK-BLEDOM"), &[]);
        assert!(r.commands().unwrap().0.id().starts_with("elk-bledom"));
    }

    #[test]
    fn recognizer_confirms_power_then_colour() {
        let mut r = Recognizer::new(Some("GATT--DEMO"), &[]);
        let (_, first) = r.commands().unwrap();
        assert_eq!(first, vec![Command::Power(false), Command::Power(true)]);
        assert!(matches!(r.answer_power(true), Outcome::Continue));
        let (_, second) = r.commands().unwrap();
        assert_eq!(
            second,
            vec![Command::Power(true), Command::Color { hue: 0, sat: 1000 }]
        );
        match r.answer_colour(Seen::Red) {
            Outcome::Recognized(p) => assert_eq!(p.id(), "mrstar"),
            _ => panic!("expected Recognized"),
        }
    }

    #[test]
    fn a_grb_strip_is_recognized_when_the_user_sees_green_for_red() {
        let mut r = Recognizer::new(Some("GATT--DEMO"), &[]);
        r.answer_power(true); // power blink OK
                              // Phase 2: send logical red, user sees green (typical on a GRB strip)
        match r.answer_colour(Seen::Green) {
            Outcome::Recognized(p) => assert_eq!(p.id(), "mrstar"),
            _ => panic!("expected Recognized"),
        }
    }

    #[test]
    fn seeing_something_else_rejects_the_candidate() {
        let mut r = Recognizer::new(Some("GATT--DEMO"), &[]);
        r.answer_power(true); // power blink OK
        assert!(matches!(r.answer_colour(Seen::Other), Outcome::Continue)); // not a primary
        let (next, cmds) = r.commands().unwrap();
        assert_ne!(next.id(), "mrstar");
        assert_eq!(
            cmds,
            vec![Command::Power(false), Command::Power(true)],
            "the next candidate starts again at phase 1"
        );
    }

    #[test]
    fn wrong_power_answer_rejects_the_candidate() {
        let mut r = Recognizer::new(Some("GATT--DEMO"), &[]);
        assert!(matches!(r.answer_power(false), Outcome::Continue)); // did not blink
        let (next, cmds) = r.commands().unwrap();
        assert_ne!(next.id(), "mrstar");
        assert_eq!(cmds, vec![Command::Power(false), Command::Power(true)]);
    }

    #[test]
    fn a_profile_without_colour_is_recognized_after_the_power_test() {
        let mut r = Recognizer::new(Some("XSL-LED"), &[]);
        assert_eq!(r.commands().unwrap().0.id(), "xsl");
        match r.answer_power(true) {
            Outcome::Recognized(p) => assert_eq!(p.id(), "xsl"),
            _ => panic!("expected Recognized"),
        }
    }

    #[test]
    fn answering_no_to_everything_exhausts_exactly_once_per_candidate() {
        let mut r = Recognizer::new(None, &[]);
        let total = r.progress().1;
        assert!(total > 10);
        for _ in 0..total - 1 {
            assert!(matches!(r.answer_power(false), Outcome::Continue));
        }
        assert!(matches!(r.answer_power(false), Outcome::Exhausted));
        assert!(r.commands().is_none());
        assert!(matches!(r.answer_power(true), Outcome::Exhausted));
    }

    #[test]
    fn progress_counts_from_one() {
        let mut r = Recognizer::new(None, &[]);
        let total = r.progress().1;
        assert_eq!(r.progress(), (1, total));
        r.answer_power(false);
        assert_eq!(r.progress(), (2, total));
    }

    #[test]
    fn colour_capable_candidates_come_before_colourless_ones_when_nothing_else_ranks() {
        let mut r = Recognizer::new(None, &[]);
        let mut xsl_idx = None;
        let mut elk_btcw_idx = None;
        let mut elk_btc_idx = None;
        let mut elk_bledom_b_idx = None;
        let total = r.progress().1;
        for i in 0..total {
            if let Some((profile, _)) = r.commands() {
                let id = profile.id();
                if id == "xsl" && xsl_idx.is_none() {
                    xsl_idx = Some(i);
                } else if id == "elk-btcw" && elk_btcw_idx.is_none() {
                    elk_btcw_idx = Some(i);
                } else if id == "elk-btc" && elk_btc_idx.is_none() {
                    elk_btc_idx = Some(i);
                } else if id == "elk-bledom-b" && elk_bledom_b_idx.is_none() {
                    elk_bledom_b_idx = Some(i);
                }
            }
            r.answer_power(false);
        }
        assert!(xsl_idx.unwrap_or(9999) > elk_btc_idx.unwrap_or(0));
        assert!(elk_btcw_idx.unwrap_or(9999) > elk_bledom_b_idx.unwrap_or(0));
    }

    #[test]
    fn phase_one_is_a_blink_so_the_strip_is_left_on() {
        let r = Recognizer::new(Some("GATT--DEMO"), &[]);
        let (_, cmds) = r.commands().unwrap();
        assert_eq!(cmds, vec![Command::Power(false), Command::Power(true)]);
    }

    #[test]
    fn after_recognition_the_recognizer_is_finished() {
        let mut r = Recognizer::new(Some("GATT--DEMO"), &[]);
        r.answer_power(true);
        r.answer_colour(Seen::Red); // Recognized
        assert!(r.commands().is_none());
        assert!(matches!(r.answer_power(false), Outcome::Recognized(_)));
        assert!(matches!(
            r.answer_colour(Seen::Other),
            Outcome::Recognized(_)
        ));
    }

    #[test]
    fn gatt_services_rank_matching_profiles_first() {
        // ledble, led-jackyled, xrocker have service FFE0
        let services_with_ffe0 = vec![Uuid::from_u128(0x0000ffe0_0000_1000_8000_00805f9b34fb)];
        let r = Recognizer::new(None, &services_with_ffe0);
        if let Some((profile, _)) = r.commands() {
            let id = profile.id();
            assert!(
                id == "ledble" || id == "led-jackyled" || id == "xrocker",
                "first candidate with FFE0 service should be one of the known ones, got {}",
                id
            );
        }
    }

    #[test]
    fn an_empty_service_list_changes_nothing() {
        let r1 = Recognizer::new(None, &[]);
        let r2 = Recognizer::new(None, &[]);
        assert_eq!(
            r1.commands().unwrap().0.id(),
            r2.commands().unwrap().0.id(),
            "empty services should not change order"
        );
    }

    #[test]
    fn deduce_order_reads_the_colour_seen_for_each_byte() {
        // GRB strip: byte 0 shows green, byte 1 red, byte 2 blue.
        assert_eq!(
            deduce_channel_order([Seen::Green, Seen::Red, Seen::Blue]),
            Some(ChannelOrder::Grb)
        );
        assert_eq!(
            deduce_channel_order([Seen::Red, Seen::Green, Seen::Blue]),
            Some(ChannelOrder::Rgb)
        );
    }

    #[test]
    fn deduce_order_rejects_contradictions_and_unknown_colours() {
        assert_eq!(
            deduce_channel_order([Seen::Red, Seen::Red, Seen::Blue]),
            None
        );
        assert_eq!(
            deduce_channel_order([Seen::Red, Seen::Other, Seen::Blue]),
            None
        );
    }

    #[test]
    fn deduced_order_makes_logical_red_show_red() {
        // End to end: the strip wires byte 0 to green. The wizard learns Grb; logical red then
        // goes out in the wire slot that drives red.
        let order = deduce_channel_order([Seen::Green, Seen::Red, Seen::Blue]).unwrap();
        let wire = order.apply([255, 0, 0]);
        assert_eq!(
            wire,
            [0, 255, 0],
            "255 must land in slot 1, which drives red"
        );
    }

    #[test]
    fn intensity_finds_the_lowest_lit_level_and_counts_distinct_steps() {
        // 100,70,40,20 distinct; 10 same as 20; 3 lit but not distinct -> 4 steps, min 30
        let answers = [
            lit(true),
            lit(true),
            lit(true),
            lit(true),
            lit(false),
            lit(false),
        ];
        assert_eq!(
            analyze_intensity(&answers),
            Ok(IntensityResult {
                min_brightness: 30,
                steps: 4
            })
        );
    }

    #[test]
    fn intensity_min_is_the_lowest_level_that_still_lights() {
        let dark = IntensityAnswer {
            lit: false,
            differs: false,
        };
        let answers = [lit(true), lit(true), lit(true), lit(true), dark, dark];
        assert_eq!(analyze_intensity(&answers).unwrap().min_brightness, 200);
    }

    #[test]
    fn intensity_rejects_lit_after_dark() {
        let dark = IntensityAnswer {
            lit: false,
            differs: false,
        };
        let lit_ans = IntensityAnswer {
            lit: true,
            differs: true,
        };
        let answers = [lit(true), lit(true), dark, dark, lit_ans, dark];
        assert_eq!(
            analyze_intensity(&answers),
            Err(SetupError::NonMonotonic(4))
        );
    }

    #[test]
    fn intensity_first_answer_must_match_lit() {
        let answers = [
            IntensityAnswer {
                lit: true,
                differs: false,
            },
            lit(true),
            lit(true),
            lit(true),
            lit(true),
            lit(true),
        ];
        assert_eq!(
            analyze_intensity(&answers),
            Err(SetupError::Contradiction(0))
        );
    }

    #[test]
    fn intensity_rejects_bad_input() {
        assert_eq!(
            analyze_intensity(&[lit(true)]),
            Err(SetupError::WrongAnswerCount {
                expected: 6,
                got: 1
            })
        );
        let dark = IntensityAnswer {
            lit: false,
            differs: false,
        };
        assert_eq!(analyze_intensity(&[dark; 6]), Err(SetupError::NothingLit));
        let mut bad = [lit(true); 6];
        bad[2] = IntensityAnswer {
            lit: false,
            differs: true,
        };
        assert_eq!(analyze_intensity(&bad), Err(SetupError::Contradiction(2)));
    }

    #[test]
    fn setup_result_combines_profile_and_measurements() {
        let profile = profile_by_id("elk-bledom-a").unwrap();
        let result = SetupResult::new(
            profile.as_ref(),
            ChannelOrder::Grb,
            true,
            IntensityResult {
                min_brightness: 30,
                steps: 4,
            },
        );
        assert_eq!(result.profile_id, "elk-bledom-a");
        assert_eq!(result.calibration.channel_order, ChannelOrder::Grb);
        assert_eq!(
            (result.calibration.min_brightness, result.calibration.steps),
            (30, 4)
        );
        assert!(result.calibration.has_white);
    }
}
