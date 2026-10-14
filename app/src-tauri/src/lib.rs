//! Tauri shell. Every command is a one-line wrapper over `lumen_core::service::Service`;
//! the behaviour lives (and is tested) there.

use lumen_core::calibration::ChannelOrder;
use lumen_core::ids::{GroupId, StripId};
use lumen_core::pool::Report;
use lumen_core::protocol::Command;
use lumen_core::registry::{Strip, Target};
use lumen_core::service::{
    profile_catalogue, ProfileInfo, Service, ServiceError, Snapshot, WizardState,
};
use lumen_core::setup::{IntensityAnswer, Seen};
use lumen_core::transport::ble::BleLink;
use lumen_core::transport::Discovered;
use std::io::Write;
use std::sync::{Arc, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

type AppService = Service<BleLink>;

/// `commands.log` in the app data dir: one line per command that touches the strip (what was asked, what came
/// back, how long it took). It is the ground truth when the strip does not do what the screen says.
static LOG_PATH: OnceLock<std::path::PathBuf> = OnceLock::new();

fn log_line(line: &str) {
    let Some(path) = LOG_PATH.get() else { return };
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(f, "{ms} {line}");
    }
}

/// Runs `fut`, logging `name args` before and the outcome with its duration after.
async fn logged<T: std::fmt::Debug>(
    name: &str,
    args: String,
    fut: impl std::future::Future<Output = Result<T, ServiceError>>,
) -> Result<T, ServiceError> {
    log_line(&format!("> {name} {args}"));
    let t = Instant::now();
    let r = fut.await;
    log_line(&format!(
        "< {name} {:?} in {} ms",
        r,
        t.elapsed().as_millis()
    ));
    r
}

struct AppState {
    service: Result<Arc<AppService>, String>,
}

/// Helper to extract AppService or return Unavailable error.
fn service<'a>(state: &'a State<'_, AppState>) -> Result<&'a AppService, ServiceError> {
    state
        .service
        .as_deref()
        .map_err(|msg| ServiceError::Unavailable(msg.clone()))
}

#[tauri::command]
async fn snapshot(state: State<'_, AppState>) -> Result<Snapshot, ServiceError> {
    Ok(service(&state)?.snapshot().await)
}

/// `"on"`, `"off"`, or `"unknown"` when the platform (or an unavailable service) cannot tell.
#[tauri::command]
async fn bluetooth_state(state: State<'_, AppState>) -> Result<&'static str, ServiceError> {
    let Ok(svc) = service(&state) else {
        return Ok("unknown");
    };
    Ok(match svc.bluetooth_on().await {
        Some(true) => "on",
        Some(false) => "off",
        None => "unknown",
    })
}

/// Opens the system's Bluetooth settings (macOS and Windows; Android has its own prompt, Linux varies).
#[tauri::command]
fn open_bluetooth_settings() {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.BluetoothSettings")
        .spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start", "ms-settings:bluetooth"])
        .spawn();
}

/// Connects the saved strips ahead of the first command; returns the ids now connected. The UI calls it on
/// start and whenever Bluetooth comes back.
#[tauri::command]
async fn warm_up(state: State<'_, AppState>) -> Result<Vec<StripId>, ServiceError> {
    let svc = service(&state)?;
    log_line("warm_up start");
    let t = Instant::now();
    let connected = svc.warm_up().await;
    log_line(&format!(
        "warm_up done in {} ms: {} connected",
        t.elapsed().as_millis(),
        connected.len()
    ));
    Ok(connected)
}

#[tauri::command]
async fn scan(state: State<'_, AppState>, secs: u64) -> Result<Vec<Discovered>, ServiceError> {
    service(&state)?.scan(secs).await
}

#[tauri::command]
async fn apply(
    state: State<'_, AppState>,
    targets: Vec<Target>,
    command: Command,
) -> Result<Report, ServiceError> {
    let svc = service(&state)?;
    logged(
        "apply",
        format!("{targets:?} {command:?}"),
        svc.apply(&targets, command),
    )
    .await
}

#[tauri::command]
async fn create_group(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), ServiceError> {
    service(&state)?.create_group(GroupId(id), &name).await
}

#[tauri::command]
async fn add_to_group(
    state: State<'_, AppState>,
    group: String,
    strip: String,
) -> Result<(), ServiceError> {
    service(&state)?
        .add_to_group(&GroupId(group), &StripId(strip))
        .await
}

#[tauri::command]
async fn remove_strip(state: State<'_, AppState>, id: String) -> Result<(), ServiceError> {
    service(&state)?.remove_strip(&StripId(id)).await
}

#[tauri::command]
async fn wizard_start(
    state: State<'_, AppState>,
    strip: String,
    advertised_name: Option<String>,
) -> Result<WizardState, ServiceError> {
    let svc = service(&state)?;
    logged(
        "wizard_start",
        format!("{strip} {advertised_name:?}"),
        svc.wizard_start(StripId(strip.clone()), advertised_name.clone()),
    )
    .await
}

#[tauri::command]
async fn wizard_probe(state: State<'_, AppState>) -> Result<Report, ServiceError> {
    let svc = service(&state)?;
    logged("wizard_probe", String::new(), svc.wizard_probe()).await
}

#[tauri::command]
async fn wizard_answer_power(
    state: State<'_, AppState>,
    turned_off_and_on: bool,
) -> Result<WizardState, ServiceError> {
    let svc = service(&state)?;
    logged(
        "wizard_answer_power",
        format!("{turned_off_and_on}"),
        svc.wizard_answer_power(turned_off_and_on),
    )
    .await
}

#[tauri::command]
async fn wizard_answer_colour(
    state: State<'_, AppState>,
    seen: Seen,
) -> Result<WizardState, ServiceError> {
    let svc = service(&state)?;
    logged(
        "wizard_answer_colour",
        format!("{seen:?}"),
        svc.wizard_answer_colour(seen),
    )
    .await
}

#[tauri::command]
async fn wizard_colour_test(
    state: State<'_, AppState>,
    index: usize,
) -> Result<Report, ServiceError> {
    let svc = service(&state)?;
    logged(
        "wizard_colour_test",
        format!("{index}"),
        svc.wizard_colour_test(index),
    )
    .await
}

#[tauri::command]
async fn wizard_intensity_test(
    state: State<'_, AppState>,
    level: usize,
) -> Result<Report, ServiceError> {
    let svc = service(&state)?;
    logged(
        "wizard_intensity_test",
        format!("{level}"),
        svc.wizard_intensity_test(level),
    )
    .await
}

#[tauri::command]
async fn wizard_finish(
    state: State<'_, AppState>,
    name: String,
    colours: Option<[Seen; 3]>,
    has_white: bool,
    intensity: Option<Vec<IntensityAnswer>>,
) -> Result<Strip, ServiceError> {
    service(&state)?
        .wizard_finish(&name, colours, has_white, intensity)
        .await
}

#[tauri::command]
async fn wizard_cancel(state: State<'_, AppState>) -> Result<(), ServiceError> {
    service(&state)?.wizard_cancel().await;
    Ok(())
}

#[tauri::command]
async fn remove_from_group(
    state: State<'_, AppState>,
    group: String,
    strip: String,
) -> Result<(), ServiceError> {
    service(&state)?
        .remove_from_group(&GroupId(group), &StripId(strip))
        .await
}

#[tauri::command]
async fn reorder_group(
    state: State<'_, AppState>,
    group: String,
    order: Vec<String>,
) -> Result<(), ServiceError> {
    let order: Vec<StripId> = order.into_iter().map(StripId).collect();
    service(&state)?
        .reorder_group(&GroupId(group), &order)
        .await
}

#[tauri::command]
async fn rename_group(
    state: State<'_, AppState>,
    group: String,
    name: String,
) -> Result<(), ServiceError> {
    service(&state)?.rename_group(&GroupId(group), &name).await
}

#[tauri::command]
async fn delete_group(state: State<'_, AppState>, group: String) -> Result<(), ServiceError> {
    service(&state)?.delete_group(&GroupId(group)).await
}

#[tauri::command]
async fn rename_strip(
    state: State<'_, AppState>,
    strip: String,
    name: String,
) -> Result<(), ServiceError> {
    service(&state)?.rename_strip(&StripId(strip), &name).await
}

#[tauri::command]
async fn wizard_power_test(state: State<'_, AppState>) -> Result<Report, ServiceError> {
    let svc = service(&state)?;
    logged("wizard_power_test", String::new(), svc.wizard_power_test()).await
}

#[tauri::command]
async fn set_channel_order(
    state: State<'_, AppState>,
    strip: String,
    order: ChannelOrder,
) -> Result<(), ServiceError> {
    service(&state)?
        .set_channel_order(&StripId(strip), order)
        .await
}

#[tauri::command]
async fn wizard_recalibrate(
    state: State<'_, AppState>,
    strip: String,
) -> Result<WizardState, ServiceError> {
    service(&state)?.wizard_recalibrate(StripId(strip)).await
}

#[tauri::command]
async fn profiles() -> Vec<ProfileInfo> {
    profile_catalogue()
}

/// btleplug's Android backend needs the JVM and its Java classes registered once, from the thread that
/// loads the library (the only one whose class loader sees the app's classes). Without this every
/// Bluetooth call panics with "Droidplug has not been initialized".
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn JNI_OnLoad(
    vm: *mut jni::sys::JavaVM,
    _reserved: *mut std::ffi::c_void,
) -> jni::sys::jint {
    // SAFETY: `vm` is the pointer the JVM passes to JNI_OnLoad.
    let vm = unsafe { jni::JavaVM::from_raw(vm) };
    let init = vm.attach_current_thread(|env| {
        lumen_core::transport::ble::btleplug::platform::init(env)
            .map_err(|e| jni::errors::Error::ParseFailed(e.to_string()))
    });
    if let Err(e) = init {
        eprintln!("Bluetooth init failed: {e}");
    }
    jni::sys::JNI_VERSION_1_6
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let service = tauri::async_runtime::block_on(async {
                let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                let _ = LOG_PATH.set(dir.join("commands.log"));
                log_line("app started");
                let link = BleLink::new().await.map_err(|e| e.to_string())?;
                Service::new(Arc::new(link), dir.join("registry.json"))
                    .map(Arc::new)
                    .map_err(|e| e.to_string())
            });
            app.manage(AppState { service });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            bluetooth_state,
            warm_up,
            open_bluetooth_settings,
            scan,
            apply,
            create_group,
            add_to_group,
            remove_strip,
            remove_from_group,
            reorder_group,
            rename_group,
            delete_group,
            rename_strip,
            wizard_power_test,
            profiles,
            set_channel_order,
            wizard_recalibrate,
            wizard_start,
            wizard_probe,
            wizard_answer_power,
            wizard_answer_colour,
            wizard_colour_test,
            wizard_intensity_test,
            wizard_finish,
            wizard_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Lumen application");
}
