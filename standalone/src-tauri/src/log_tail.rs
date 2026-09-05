use std::io::{self, Read, Seek, SeekFrom};

/// Read only the requested suffix, dropping an initial partial UTF-8 character.
/// Bound the read as well as the seek: the log can grow while it is being read.
pub(crate) fn read_utf8_tail(
    reader: &mut (impl Read + Seek),
    max_bytes: usize,
) -> io::Result<String> {
    let end = reader.seek(SeekFrom::End(0))?;
    let len = end.min(max_bytes as u64);
    reader.seek(SeekFrom::Start(end - len))?;
    let mut bytes = Vec::new();
    reader.take(len).read_to_end(&mut bytes)?;
    let start = if end > len {
        bytes
            .iter()
            .position(|byte| byte & 0xc0 != 0x80)
            .unwrap_or(bytes.len())
    } else {
        0
    };
    String::from_utf8(bytes[start..].to_vec())
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn preserves_short_logs_and_handles_empty_limits() {
        assert_eq!(
            read_utf8_tail(&mut Cursor::new("hello"), 10).unwrap(),
            "hello"
        );
        assert_eq!(read_utf8_tail(&mut Cursor::new("hello"), 0).unwrap(), "");
        assert_eq!(read_utf8_tail(&mut Cursor::new(""), 10).unwrap(), "");
    }

    #[test]
    fn skips_only_the_leading_partial_character() {
        for limit in 2..5 {
            assert_eq!(
                read_utf8_tail(&mut Cursor::new("a🐭z"), limit).unwrap(),
                "z"
            );
        }
        assert_eq!(read_utf8_tail(&mut Cursor::new("a🐭z"), 5).unwrap(), "🐭z");
        assert_eq!(read_utf8_tail(&mut Cursor::new("🐭"), 2).unwrap(), "");
        assert!(read_utf8_tail(&mut Cursor::new(vec![0xff]), 10).is_err());
    }

    struct CountedReader {
        inner: Cursor<Vec<u8>>,
        bytes_read: usize,
    }

    impl Read for CountedReader {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            let count = self.inner.read(buf)?;
            self.bytes_read += count;
            Ok(count)
        }
    }

    impl Seek for CountedReader {
        fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
            let offset = self.inner.seek(pos)?;
            if matches!(pos, SeekFrom::End(0)) {
                // Append after the size snapshot: these bytes must not extend
                // the read budget or shift the selected suffix.
                self.inner.get_mut().extend_from_slice(b"later");
            }
            Ok(offset)
        }
    }

    #[test]
    fn reads_only_the_budget_even_when_the_log_grows() {
        let mut reader = CountedReader {
            inner: Cursor::new(vec![b'x'; 1_000_000]),
            bytes_read: 0,
        };
        assert_eq!(
            read_utf8_tail(&mut reader, 10_000).unwrap(),
            "x".repeat(10_000)
        );
        assert_eq!(reader.bytes_read, 10_000);
    }
}
