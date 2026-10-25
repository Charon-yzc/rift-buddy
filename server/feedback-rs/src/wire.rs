// Retain only the bounded feedback envelope. RawValue validates the entire JSON
// without expanding attacker-controlled arrays/objects into a Value tree.
use serde::de::{IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::{value::RawValue, Value};
use std::fmt;

use crate::validate::{self, Feedback, FeedbackError, IMAGE_LIMIT};

#[derive(Default)]
struct Fields<'a, const IMAGE: bool> {
    values: [Option<&'a RawValue>; 4],
}

impl<'de, const IMAGE: bool> Deserialize<'de> for Fields<'de, IMAGE> {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct FieldsVisitor<const IMAGE: bool>;
        impl<'de, const IMAGE: bool> Visitor<'de> for FieldsVisitor<IMAGE> {
            type Value = Fields<'de, IMAGE>;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result { f.write_str("an object") }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let mut fields = Fields::default();
                while let Some(key) = map.next_key::<String>()? {
                    let index = match (IMAGE, key.as_str()) {
                        (false, "text") | (true, "type") => Some(0),
                        (false, "appVersion") | (true, "data") => Some(1),
                        (false, "version") => Some(2),
                        (false, "images") => Some(3),
                        _ => None,
                    };
                    if let Some(index) = index {
                        fields.values[index] = Some(map.next_value()?);
                    } else {
                        map.next_value::<IgnoredAny>()?;
                    }
                }
                Ok(fields)
            }
        }
        d.deserialize_map(FieldsVisitor::<IMAGE>)
    }
}

struct Images<'a>(Vec<&'a RawValue>, bool);
impl<'de> Deserialize<'de> for Images<'de> {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct ImagesVisitor;
        impl<'de> Visitor<'de> for ImagesVisitor {
            type Value = Images<'de>;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result { f.write_str("an array") }
            fn visit_seq<S: SeqAccess<'de>>(self, mut seq: S) -> Result<Self::Value, S::Error> {
                let mut values = Vec::with_capacity(IMAGE_LIMIT);
                while values.len() < IMAGE_LIMIT {
                    match seq.next_element()? {
                        Some(value) => values.push(value),
                        None => return Ok(Images(values, false)),
                    }
                }
                let too_many = seq.next_element::<IgnoredAny>()?.is_some();
                while seq.next_element::<IgnoredAny>()?.is_some() {}
                Ok(Images(values, too_many))
            }
        }
        d.deserialize_seq(ImagesVisitor)
    }
}

fn string(raw: Option<&RawValue>) -> Value {
    raw.filter(|r| r.get().starts_with('"'))
        .and_then(|r| serde_json::from_str::<String>(r.get()).ok())
        .map(Value::String).unwrap_or(Value::Null)
}

fn image(raw: &RawValue) -> Value {
    let Ok(fields) = serde_json::from_str::<Fields<true>>(raw.get()) else { return Value::Null };
    serde_json::json!({"type": string(fields.values[0]), "data": string(fields.values[1])})
}

pub fn parse(bytes: &[u8]) -> Result<Feedback, FeedbackError> {
    let mut decoder = serde_json::Deserializer::from_slice(bytes);
    let fields = Fields::<false>::deserialize(&mut decoder).map_err(|_| FeedbackError::Invalid)?;
    // Preserve JSON.parse ordering: malformed/trailing input is always 400,
    // before validating image byte budgets or other business rules.
    decoder.end().map_err(|_| FeedbackError::Invalid)?;
    let version = fields.values[2]
        .and_then(|r| serde_json::from_str::<serde_json::Number>(r.get()).ok())
        .map(Value::Number).unwrap_or(Value::Null);
    let images = fields.values[3].and_then(|r| serde_json::from_str::<Images>(r.get()).ok())
        .map(|Images(values, too_many)| if too_many {
            Value::Array(vec![Value::Null; IMAGE_LIMIT + 1])
        } else { Value::Array(values.into_iter().map(image).collect()) }).unwrap_or(Value::Null);
    validate::validate(&serde_json::json!({
        "text": string(fields.values[0]), "appVersion": string(fields.values[1]),
        "version": version, "images": images,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn good() -> &'static str { r#"{"version":1,"appVersion":"0.59.37","text":"test","images":[]}"# }
    #[test]
    fn duplicate_keys_use_last_value_even_after_wrong_types() {
        let input = good().replace("\"text\":\"test\"", "\"text\":[],\"text\":\"test\"");
        assert_eq!(parse(input.as_bytes()), parse(good().as_bytes()));
        assert_eq!(parse(good().replace("\"text\":\"test\"", "\"text\":\"test\",\"text\":[]").as_bytes()), Err(FeedbackError::Invalid));
    }
    #[test]
    fn object_fields_do_not_alias_image_fields() {
        assert_eq!(parse(good().replace("\"text\":\"test\"", "\"text\":\"test\",\"type\":\"wrong\"").as_bytes()).unwrap().text, "test");
    }
    #[test]
    fn unknown_and_wrong_known_arrays_are_not_expanded() {
        let array = format!("[{}0]", "0,".repeat(4_000_000));
        let unknown = good().replace("\"images\":[]", &format!("\"extra\":{array},\"images\":[]"));
        assert_eq!(parse(unknown.as_bytes()), parse(good().as_bytes()));
        let wrong = good().replace("\"text\":\"test\"", &format!("\"text\":{array}"));
        assert_eq!(parse(wrong.as_bytes()), Err(FeedbackError::Invalid));
    }
    #[test]
    fn too_many_images_and_trailing_invalid_json_are_invalid() {
        assert_eq!(parse(good().replace("[]", "[null,null,null,null]").as_bytes()), Err(FeedbackError::Invalid));
        assert_eq!(parse(format!("{} {{", good()).as_bytes()), Err(FeedbackError::Invalid));
        assert_eq!(parse(good().replace(":1,", ":1.0,").as_bytes()), parse(good().as_bytes()));
    }
}
