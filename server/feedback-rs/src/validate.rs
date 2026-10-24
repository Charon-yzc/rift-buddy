// Feedback payload validation. Mirrors validateFeedback / feedbackText in
// relay/feedback-server.mjs and src/core/feedback.mjs.
//
// JS parity notes:
// - text length counts UTF-16 code units, exactly like String#length, so an
//   emoji counts as two and the 2000 limit matches the desktop dialog.
// - base64 keeps the same structural rules and, like Buffer.from(..., 'base64'),
//   tolerates non-zero trailing bits; the canonical encoding is what gets stored.

use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::DecodePaddingMode;
use base64::Engine;
use serde::Serialize;

use crate::png;

pub const TEXT_LIMIT: usize = 2000;
pub const IMAGE_LIMIT: usize = 3;
pub const BODY_BYTES: usize = 14 * 1024 * 1024;

const LENIENT_BASE64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::RequireCanonical)
        .with_decode_allow_trailing_bits(true),
);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FeedbackImage {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Feedback {
    pub version: u32,
    pub app_version: String,
    pub text: String,
    pub images: Vec<FeedbackImage>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeedbackError {
    Invalid,
    TooLarge,
}

impl FeedbackError {
    pub fn status(self) -> u16 {
        match self {
            FeedbackError::Invalid => 400,
            FeedbackError::TooLarge => 413,
        }
    }
}

/// Mirrors feedbackText: a string is required, control characters are refused
/// (tab, newline and carriage return stay legal), and the result is trimmed.
pub fn feedback_text(value: Option<&serde_json::Value>) -> Result<String, FeedbackError> {
    let raw = match value {
        Some(serde_json::Value::String(text)) => text,
        _ => return Err(FeedbackError::Invalid),
    };
    if raw.encode_utf16().count() > TEXT_LIMIT {
        return Err(FeedbackError::Invalid);
    }
    for code in raw.encode_utf16() {
        let code = code as u32;
        if code <= 0x08 || code == 0x0b || code == 0x0c || (0x0e..=0x1f).contains(&code) {
            return Err(FeedbackError::Invalid);
        }
    }
    // ECMAScript trim differs from Rust whitespace for BOM and U+0085.
    Ok(raw.trim_matches(|c: char| matches!(c,
        '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' |
        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
        '\u{205f}' | '\u{3000}' | '\u{feff}'
    )).to_string())
}

fn is_version(text: &str) -> bool {
    let parts: Vec<&str> = text.split('.').collect();
    parts.len() == 3
        && parts.iter().all(|part| {
            let digits = part.as_bytes();
            !digits.is_empty() && digits.len() <= 3 && digits.iter().all(u8::is_ascii_digit)
        })
}

fn is_base64_shape(data: &str) -> bool {
    if data.is_empty() || data.len() % 4 != 0 || data.len() > ((png::IMAGE_BYTES + 2) / 3) * 4 {
        return false;
    }
    let bytes = data.as_bytes();
    let padding = bytes.iter().rev().take_while(|byte| **byte == b'=').count();
    if padding > 2 {
        return false;
    }
    bytes[..bytes.len() - padding]
        .iter()
        .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'+' || *byte == b'/')
}

pub fn validate(input: &serde_json::Value) -> Result<Feedback, FeedbackError> {
    let object = input.as_object().ok_or(FeedbackError::Invalid)?;
    let text = feedback_text(object.get("text"))?;

    if object.get("version").and_then(|value| value.as_f64()) != Some(1.0) {
        return Err(FeedbackError::Invalid);
    }
    let app_version = match object.get("appVersion") {
        Some(serde_json::Value::String(value)) if is_version(value) => value.clone(),
        _ => return Err(FeedbackError::Invalid),
    };

    let raw_images = match object.get("images") {
        Some(serde_json::Value::Array(images)) => images,
        _ => return Err(FeedbackError::Invalid),
    };
    if raw_images.len() > IMAGE_LIMIT {
        return Err(FeedbackError::Invalid);
    }

    let mut images = Vec::with_capacity(raw_images.len());
    let mut total = 0usize;
    for image in raw_images {
        let image = image.as_object().ok_or(FeedbackError::Invalid)?;
        if image.get("type").and_then(|value| value.as_str()) != Some("image/png") {
            return Err(FeedbackError::Invalid);
        }
        let data = image.get("data").and_then(|value| value.as_str()).ok_or(FeedbackError::Invalid)?;
        if !is_base64_shape(data) {
            return Err(FeedbackError::Invalid);
        }
        let bytes = LENIENT_BASE64.decode(data).map_err(|_| FeedbackError::Invalid)?;
        total += bytes.len();
        if total > png::IMAGE_BYTES {
            return Err(FeedbackError::TooLarge);
        }
        // The Node PNG validator has no HTTP status; even a dimension error is 400.
        png::validate(&bytes).map_err(|_| FeedbackError::Invalid)?;
        images.push(FeedbackImage { kind: "image/png", data: LENIENT_BASE64.encode(&bytes) });
    }

    if text.is_empty() && images.is_empty() {
        return Err(FeedbackError::Invalid);
    }

    Ok(Feedback { version: 1, app_version, text, images })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::png::tests::png;
    use serde_json::json;

    fn png_base64() -> String {
        LENIENT_BASE64.encode(png(1, 1))
    }

    fn input() -> serde_json::Value {
        json!({
            "version": 1,
            "appVersion": "0.59.26",
            "text": "画面遮住技能栏",
            "images": [{ "type": "image/png", "data": png_base64() }]
        })
    }

    #[test]
    fn strips_unknown_fields_and_keeps_canonical_images() {
        let mut value = input();
        value["credentials"] = json!("must not store");
        value["account"] = json!("private");
        let feedback = validate(&value).expect("valid feedback");
        let serialized = serde_json::to_value(&feedback).unwrap();
        let text = serialized.to_string();
        assert!(text.contains("\"version\":1"));
        assert!(text.contains("\"appVersion\":\"0.59.26\""));
        assert!(text.contains("\"text\":\"画面遮住技能栏\""));
        assert!(!text.contains("must not store") && !text.contains("account"));
        assert_eq!(serialized["images"][0]["data"], json!(png_base64()));
    }

    #[test]
    fn rejects_oversized_text_and_control_characters() {
        let mut value = input();
        value["text"] = json!("x".repeat(2001));
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));

        let mut value = input();
        value["text"] = json!("ok\u{7}fine");
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));

        let mut value = input();
        value["text"] = json!("tab\tnewline\ncarriage\r");
        assert!(validate(&value).is_ok());
    }

    #[test]
    fn counts_astral_characters_as_two_units() {
        let mut value = input();
        value["text"] = json!("😀".repeat(1000));
        assert!(validate(&value).is_ok());
        value["text"] = json!("😀".repeat(1001));
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));
    }

    #[test]
    fn trims_ecmascript_whitespace_without_removing_next_line() {
        assert_eq!(feedback_text(Some(&json!("\u{feff} hello \u{feff}"))).unwrap(), "hello");
        assert_eq!(feedback_text(Some(&json!("\u{85}hello\u{85}"))).unwrap(), "\u{85}hello\u{85}");
    }

    #[test]
    fn rejects_malformed_envelopes() {
        let mut value = input();
        value["version"] = json!(2);
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));

        let mut value = input();
        value["appVersion"] = json!("0.59");
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));

        let mut value = input();
        let one = value["images"][0].clone();
        value["images"] = json!([one.clone(), one, json!("x"), json!("y")]);
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));

        let mut value = input();
        value["images"] = json!([{ "type": "image/svg+xml", "data": "PHN2Zy8+" }]);
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));

        let value = json!({ "version": 1, "appVersion": "0.59.26", "text": " ", "images": [] });
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));

        let value = json!({ "version": 1, "appVersion": "0.59.26", "images": [] });
        assert_eq!(validate(&value), Err(FeedbackError::Invalid));
    }
}
