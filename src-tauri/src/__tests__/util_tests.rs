use super::*;
use crate::types::RecordingMeta;
use std::fs;
use std::path::{Path, PathBuf};

/// Create a unique, empty temp directory for a test.
fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("bloom-test-{tag}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn sample_meta(id: &str, filename: &str, created_at: &str) -> RecordingMeta {
    RecordingMeta {
        id: id.to_string(),
        title: "Sample".to_string(),
        filename: filename.to_string(),
        created_at: created_at.to_string(),
        duration_secs: 12.0,
        file_size_bytes: 0,
        source: "screen".to_string(),
        quality: "1080p".to_string(),
        has_microphone: true,
        has_system_audio: false,
        target_label: "Display 1".to_string(),
        starred: false,
        tags: vec![],
        folder: String::new(),
    }
}

#[test]
fn is_leap_year_rules() {
    assert!(is_leap(2000));
    assert!(is_leap(2024));
    assert!(!is_leap(1900));
    assert!(!is_leap(2023));
}

#[test]
fn epoch_to_utc_known_values() {
    assert_eq!(epoch_to_utc(0), (1970, 1, 1, 0, 0, 0));
    assert_eq!(epoch_to_utc(1_609_459_200), (2021, 1, 1, 0, 0, 0));
    assert_eq!(epoch_to_utc(1_609_462_923), (2021, 1, 1, 1, 2, 3));
}

#[test]
fn now_iso_is_well_formed() {
    let s = now_iso();
    assert_eq!(s.len(), 20, "expected YYYY-MM-DDTHH:MM:SSZ, got {s}");
    assert!(s.ends_with('Z'));
    assert_eq!(s.as_bytes()[4], b'-');
    assert_eq!(s.as_bytes()[10], b'T');
}

#[test]
fn meta_path_for_swaps_extension() {
    assert_eq!(meta_path_for(Path::new("/a/b/foo.mp4")), PathBuf::from("/a/b/foo.bloom.json"));
    assert_eq!(meta_path_for(Path::new("clip.webm")), PathBuf::from("clip.bloom.json"));
}

#[test]
fn dir_size_sums_files() {
    let dir = temp_dir("dirsize");
    fs::write(dir.join("a.bin"), [0u8; 100]).unwrap();
    fs::write(dir.join("b.bin"), [0u8; 50]).unwrap();
    assert_eq!(dir_size(&dir), 150);
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn load_and_find_recordings() {
    let dir = temp_dir("library");

    for (id, name, created) in [
        ("id-old", "old.mp4", "2020-01-01T00:00:00Z"),
        ("id-new", "new.mp4", "2024-06-01T00:00:00Z"),
    ] {
        fs::write(dir.join(name), b"video-bytes").unwrap();
        let meta = sample_meta(id, name, created);
        let json = serde_json::to_string(&meta).unwrap();
        fs::write(meta_path_for(&dir.join(name)), json).unwrap();
    }
    fs::write(dir.join("random.txt"), b"nope").unwrap();
    fs::write(dir.join("notmeta.json"), b"{}").unwrap();

    let all = load_all_recordings(&dir);
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].meta.id, "id-new");
    assert_eq!(all[1].meta.id, "id-old");

    let found = find_recording(&dir, "id-old").expect("should find by id");
    assert_eq!(found.meta.filename, "old.mp4");
    assert!(find_recording(&dir, "missing").is_none());

    fs::remove_dir_all(&dir).ok();
}
