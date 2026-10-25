// Bounded PNG check for feedback screenshots: the relay never decodes pixels,
// it only proves the bytes are one well-formed PNG with sane dimensions.
// Mirrors services/feedback-images.mjs (validateFeedbackPng) exactly.

pub const IMAGE_BYTES: usize = 10 * 1024 * 1024;
pub const PIXELS: u64 = 16 * 1024 * 1024;
pub const DIMENSION: u32 = 8192;

pub const SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Dimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PngError {
    Format,
    TooLarge,
}

pub fn validate(bytes: &[u8]) -> Result<Dimensions, PngError> {
    if bytes.len() < 57 || bytes.len() > IMAGE_BYTES {
        return Err(PngError::Format);
    }
    if bytes[..8] != SIGNATURE {
        return Err(PngError::Format);
    }

    let mut at = 8usize;
    let mut count = 0usize;
    let mut idat = false;
    let mut ended = false;
    let mut dimensions = None;

    while at < bytes.len() {
        count += 1;
        if count > 4096 || at + 12 > bytes.len() {
            return Err(PngError::Format);
        }
        let len = u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]) as usize;
        let kind = &bytes[at + 4..at + 8];
        let end = at + 12 + len;
        if end > bytes.len() {
            return Err(PngError::Format);
        }
        let expected = u32::from_be_bytes([bytes[at + 8 + len], bytes[at + 9 + len], bytes[at + 10 + len], bytes[at + 11 + len]]);
        if crc32fast::hash(&bytes[at + 4..at + 8 + len]) != expected {
            return Err(PngError::Format);
        }
        if count == 1 {
            if kind != b"IHDR" || len != 13 {
                return Err(PngError::Format);
            }
            let width = u32::from_be_bytes([bytes[at + 8], bytes[at + 9], bytes[at + 10], bytes[at + 11]]);
            let height = u32::from_be_bytes([bytes[at + 12], bytes[at + 13], bytes[at + 14], bytes[at + 15]]);
            if width == 0 || height == 0 || width > DIMENSION || height > DIMENSION || (width as u64) * (height as u64) > PIXELS {
                return Err(PngError::TooLarge);
            }
            dimensions = Some(Dimensions { width, height });
        } else if kind == b"IHDR" {
            return Err(PngError::Format);
        }
        if kind == b"IDAT" {
            idat = true;
        }
        if kind == b"IEND" {
            if len != 0 || end != bytes.len() || !idat {
                return Err(PngError::Format);
            }
            ended = true;
        }
        at = end;
    }

    if !ended {
        return Err(PngError::Format);
    }
    dimensions.ok_or(PngError::Format)
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// Build a minimal PNG the way the desktop test fixture does.
    pub fn png(width: u32, height: u32) -> Vec<u8> {
        fn chunk(kind: &[u8], data: &[u8]) -> Vec<u8> {
            let mut out = Vec::new();
            out.extend_from_slice(&(data.len() as u32).to_be_bytes());
            out.extend_from_slice(kind);
            out.extend_from_slice(data);
            let mut crc_input = Vec::from(kind);
            crc_input.extend_from_slice(data);
            out.extend_from_slice(&crc32fast::hash(&crc_input).to_be_bytes());
            out
        }
        let mut head = vec![0u8; 13];
        head[0..4].copy_from_slice(&width.to_be_bytes());
        head[4..8].copy_from_slice(&height.to_be_bytes());
        head[8] = 8;
        head[9] = 6;
        let mut out = Vec::from(SIGNATURE);
        out.extend_from_slice(&chunk(b"IHDR", &head));
        out.extend_from_slice(&chunk(b"IDAT", &[0, 0, 0, 0, 255]));
        out.extend_from_slice(&chunk(b"IEND", &[]));
        out
    }

    fn bytes(width: u32, height: u32) -> Vec<u8> {
        png(width, height)
    }

    #[test]
    fn accepts_a_small_png_and_reports_dimensions() {
        assert_eq!(validate(&bytes(1, 1)), Ok(Dimensions { width: 1, height: 1 }));
    }

    #[test]
    fn rejects_oversized_dimensions() {
        assert_eq!(validate(&bytes(8192, 8192)), Err(PngError::TooLarge));
    }

    #[test]
    fn rejects_a_corrupted_trailer() {
        let mut data = bytes(1, 1);
        let last = data.len() - 1;
        data[last] ^= 1;
        assert_eq!(validate(&data), Err(PngError::Format));
    }

    #[test]
    fn rejects_non_png_bytes() {
        assert_eq!(validate(b"<svg/>"), Err(PngError::Format));
    }
}
