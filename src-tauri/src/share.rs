//! Native share sheet (macOS) with sensible fallbacks elsewhere.

use tauri::AppHandle;

#[cfg(target_os = "macos")]
pub fn share_file(app: &AppHandle, path: &str) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::AnyThread;
    use objc2_app_kit::{NSSharingServicePicker, NSView};
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSArray, NSRectEdge, NSURL, NSString};
    use tauri::Manager;

    let path = path.to_string();
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Hlavné okno sa nenašlo.".to_string())?;

    window
        .with_webview(move |webview| {
            unsafe {
                let ns_view: &NSView = &*(webview.inner() as *const NSView);
                let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
                let items: Vec<Retained<AnyObject>> = vec![Retained::cast_unchecked(url)];
                let items_array = NSArray::from_retained_slice(&items);
                let picker = NSSharingServicePicker::initWithItems(
                    NSSharingServicePicker::alloc(),
                    &items_array,
                );
                let rect = CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(1.0, 1.0));
                picker.showRelativeToRect_ofView_preferredEdge(rect, ns_view, NSRectEdge::MinY);
            }
        })
        .map_err(|e| format!("Nepodarilo sa otvoriť zdieľanie: {e}"))?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn share_file(_app: &AppHandle, path: &str) -> Result<(), String> {
    crate::library::reveal_in_finder(path.to_string())
}
