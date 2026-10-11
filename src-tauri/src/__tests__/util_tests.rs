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
        notes: String::new(),
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

#[test]
fn load_and_find_recurse_into_subfolders_and_skip_hidden() {
    let dir = temp_dir("recursive");
    fs::create_dir_all(dir.join("Work/Demos")).unwrap();
    fs::create_dir_all(dir.join(".trash")).unwrap();

    // relative filename resolves against the library root
    let rel = "Work/Demos/clip.mp4";
    fs::write(dir.join(rel), b"v").unwrap();
    let meta = sample_meta("id-nested", rel, "2024-01-01T00:00:00Z");
    fs::write(meta_path_for(&dir.join(rel)), serde_json::to_string(&meta).unwrap()).unwrap();

    // hidden folders are ignored
    fs::write(dir.join(".trash/gone.mp4"), b"v").unwrap();
    let hidden = sample_meta("id-hidden", ".trash/gone.mp4", "2024-02-01T00:00:00Z");
    fs::write(meta_path_for(&dir.join(".trash/gone.mp4")), serde_json::to_string(&hidden).unwrap()).unwrap();

    // legacy bare filename in a sub-folder falls back to the sidecar's directory
    fs::write(dir.join("Work/bare.mp4"), b"v").unwrap();
    let bare = sample_meta("id-bare", "bare.mp4", "2023-01-01T00:00:00Z");
    fs::write(meta_path_for(&dir.join("Work/bare.mp4")), serde_json::to_string(&bare).unwrap()).unwrap();

    let all = load_all_recordings(&dir);
    assert_eq!(all.len(), 2);
    let nested = find_recording(&dir, "id-nested").unwrap();
    assert_eq!(PathBuf::from(&nested.path), dir.join(rel));
    let bare = find_recording(&dir, "id-bare").unwrap();
    assert_eq!(PathBuf::from(&bare.path), dir.join("Work/bare.mp4"));
    assert!(find_recording(&dir, "id-hidden").is_none());

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn sanitize_folder_name_rules() {
    assert_eq!(sanitize_folder_name("  My Demos "), "My Demos");
    assert_eq!(sanitize_folder_name("a/b"), "a/b");
    assert_eq!(sanitize_folder_name("../../etc"), "etc");
    assert_eq!(sanitize_folder_name("we:ird*name"), "we-ird-name");
    assert_eq!(sanitize_folder_name(".hidden"), "hidden");
    assert_eq!(sanitize_folder_name("   "), "");
}

#[test]
fn relative_filename_uses_forward_slashes() {
    let root = Path::new("/lib");
    assert_eq!(relative_filename(root, Path::new("/lib/a/b/c.mp4")), "a/b/c.mp4");
    assert_eq!(relative_filename(root, Path::new("/lib/c.mp4")), "c.mp4");
}

#[test]
fn unique_path_avoids_collisions() {
    let dir = temp_dir("unique");
    fs::write(dir.join("a.mp4"), b"x").unwrap();
    assert_eq!(unique_path(&dir, "a.mp4"), dir.join("a-2.mp4"));
    assert_eq!(unique_path(&dir, "b.mp4"), dir.join("b.mp4"));
    fs::remove_dir_all(&dir).ok();
}
