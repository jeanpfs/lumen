//! Pure helpers for command-line input and output.

use uuid::Uuid;

/// "BC 01 01 01 55", "bc010101 55" and "BC0101 0155" all parse to the same bytes.
pub fn parse_hex(s: &str) -> Result<Vec<u8>, String> {
    let clean: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    if !clean.is_ascii() {
        return Err(format!("non-ASCII character in {s:?}"));
    }
    if !clean.len().is_multiple_of(2) {
        return Err(format!("odd number of hex digits in {s:?}"));
    }
    (0..clean.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&clean[i..i + 2], 16)
                .map_err(|e| format!("bad hex {:?}: {e}", &clean[i..i + 2]))
        })
        .collect()
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Accepts a full UUID or a 16-bit short form such as "fff3".
pub fn parse_uuid(s: &str) -> Result<Uuid, String> {
    let s = s.trim();
    if s.len() == 4 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        let short = u16::from_str_radix(s, 16).map_err(|e| e.to_string())?;
        return Ok(Uuid::from_u128(
            ((short as u128) << 96) | 0x0000_1000_8000_0080_5f9b_34fb,
        ));
    }
    Uuid::parse_str(s).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_ignores_whitespace_and_case() {
        assert_eq!(
            parse_hex("BC 01 01 01 55").unwrap(),
            vec![0xBC, 0x01, 0x01, 0x01, 0x55]
        );
        assert_eq!(
            parse_hex("bc010101 55").unwrap(),
            vec![0xBC, 0x01, 0x01, 0x01, 0x55]
        );
    }

    #[test]
    fn hex_rejects_odd_length_bad_digits_and_non_ascii() {
        assert!(parse_hex("BC0").is_err());
        assert!(parse_hex("ZZ").is_err());
        assert!(parse_hex("é1").is_err());
    }

    #[test]
    fn to_hex_is_uppercase_and_space_separated() {
        assert_eq!(to_hex(&[0xBC, 0x01, 0x55]), "BC 01 55");
    }

    #[test]
    fn short_uuid_expands_to_the_bluetooth_base() {
        assert_eq!(
            parse_uuid("fff3").unwrap(),
            Uuid::parse_str("0000fff3-0000-1000-8000-00805f9b34fb").unwrap()
        );
        assert_eq!(
            parse_uuid("0000FFF3-0000-1000-8000-00805F9B34FB").unwrap(),
            Uuid::parse_str("0000fff3-0000-1000-8000-00805f9b34fb").unwrap()
        );
        assert!(parse_uuid("nope").is_err());
    }
}
