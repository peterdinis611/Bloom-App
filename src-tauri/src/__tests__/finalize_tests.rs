use super::FinalizeInfo;

#[test]
fn finalize_without_ffmpeg_uses_wall_duration() {
    let dir = std::env::temp_dir().join(format!("bloom-fin-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("clip.mp4");
    std::fs::write(&file, b"not a real mp4").unwrap();

    let info = super::finalize_recording(&file, 12.5);
    assert!((info.duration_secs - 12.5).abs() < f64::EPSILON);
    assert_eq!(info.file_size_bytes, b"not a real mp4".len() as u64);

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn finalize_info_struct_fields() {
    let info = FinalizeInfo {
        duration_secs: 1.0,
        file_size_bytes: 100,
    };
    assert_eq!(info.file_size_bytes, 100);
}
