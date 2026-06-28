use std::fs;
use tauri::Manager;

/// Returns (and creates if needed) ~/Movies/Bloom on macOS, ~/Videos/Bloom on Linux/Windows.
#[tauri::command]
fn get_bloom_dir(app: tauri::AppHandle) -> Result<String, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let dir = home.join("Movies").join("Bloom");

    #[cfg(not(target_os = "macos"))]
    let dir = home.join("Videos").join("Bloom");

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Saves a base-64-encoded recording to the Bloom folder.
/// Returns the full path of the saved file.
#[tauri::command]
fn save_recording(app: tauri::AppHandle, filename: String, data_b64: String) -> Result<String, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let dir = home.join("Movies").join("Bloom");

    #[cfg(not(target_os = "macos"))]
    let dir = home.join("Videos").join("Bloom");

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Decode base64 → raw bytes
    use std::io::Write;
    let bytes = decode_base64(&data_b64)?;

    let path = dir.join(&filename);
    let mut f = fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().into_owned())
}

/// Minimal base64 decoder (alphabet A-Z a-z 0-9 + /).
fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let input: Vec<u8> = input.bytes().filter(|b| *b != b'=').collect();
    let table: Vec<Option<u8>> = (0u8..=127)
        .map(|c| match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+'        => Some(62),
            b'/'        => Some(63),
            _           => None,
        })
        .collect();

    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    for chunk in input.chunks(4) {
        let vals: Vec<u8> = chunk
            .iter()
            .filter_map(|&b| if b < 128 { table[b as usize] } else { None })
            .collect();
        match vals.len() {
            4 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
                out.push((vals[1] << 4) | (vals[2] >> 2));
                out.push((vals[2] << 6) | vals[3]);
            }
            3 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
                out.push((vals[1] << 4) | (vals[2] >> 2));
            }
            2 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
            }
            _ => {}
        }
    }
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_bloom_dir, save_recording])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
