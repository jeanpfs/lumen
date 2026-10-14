//! Diagnostic CLI for BLE LED strips: scan, dump GATT, write raw bytes, measure.

mod parse;

use anyhow::{anyhow, Context, Result};
use btleplug::api::{Central, CharPropFlags, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::{Adapter, Manager, Peripheral};
use clap::{Parser, Subcommand};
use futures::StreamExt;
use lumen_core::calibration::{Calibration, ChannelOrder};
use lumen_core::families::{all_profiles, profile_by_id};
use lumen_core::ids::StripId;
use lumen_core::pool::{Job, Pool, DEFAULT_MAX_LIVE};
use lumen_core::protocol::{Command, MrStar};
use lumen_core::transport::ble::BleLink;
use parse::{parse_hex, parse_uuid, to_hex};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Parser)]
#[command(about = "BLE LED strip diagnostics")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// List nearby BLE devices, strongest signal first.
    Scan {
        #[arg(long, default_value_t = 8)]
        secs: u64,
        /// Only show devices whose name contains this text (case-insensitive).
        #[arg(long)]
        name: Option<String>,
    },
    /// Connect and print every service and characteristic.
    Dump { id: String },
    /// Write raw bytes to a characteristic and print notifications for 2 s.
    Write {
        id: String,
        /// Characteristic UUID, full or 16-bit (e.g. fff3).
        characteristic: String,
        /// Hex bytes, e.g. "BC 01 01 01 55".
        hex: String,
        /// Also subscribe to this characteristic before writing (e.g. fff4).
        #[arg(long)]
        listen: Option<String>,
    },
    /// Measure connect time and write latency.
    Measure {
        id: String,
        characteristic: String,
        hex: String,
        #[arg(long, default_value_t = 20, value_parser = clap::value_parser!(u32).range(1..))]
        n: u32,
    },
    /// Send one command to a strip using any profile from the catalogue (see `probe profiles`).
    /// COMMAND is `on`, `off`, `color <hue 0-360> <sat 0-1000>` or `brightness <1-1000>`.
    Send {
        id: String,
        #[arg(long)]
        profile: String,
        /// Raise brightness commands to this minimum (calibrated value, 1-1000).
        #[arg(long, value_parser = clap::value_parser!(u16).range(1..=1000))]
        min_brightness: Option<u16>,
        /// Channel order for RGB-byte profiles: rgb, rbg, grb, gbr, brg or bgr.
        #[arg(long, default_value = "rgb")]
        order: String,
        #[arg(num_args = 1.., required = true)]
        command: Vec<String>,
    },
    /// List every profile in the catalogue with its capabilities.
    Profiles,
    /// Drive one strip through the core pool: power on, red, green, blue, half brightness, off.
    Demo { id: String },
}

#[tokio::main]
async fn main() -> Result<()> {
    match Cli::parse().cmd {
        Cmd::Scan { secs, name } => scan(secs, name).await,
        Cmd::Dump { id } => dump(&id).await,
        Cmd::Write {
            id,
            characteristic,
            hex,
            listen,
        } => write(&id, &characteristic, &hex, listen.as_deref()).await,
        Cmd::Measure {
            id,
            characteristic,
            hex,
            n,
        } => measure(&id, &characteristic, &hex, n).await,
        Cmd::Send {
            id,
            profile,
            min_brightness,
            order,
            command,
        } => send(&id, &profile, min_brightness, &order, &command).await,
        Cmd::Profiles => {
            profiles();
            Ok(())
        }
        Cmd::Demo { id } => demo(&id).await,
    }
}

async fn adapter() -> Result<Adapter> {
    let manager = Manager::new().await?;
    manager
        .adapters()
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("no Bluetooth adapter found"))
}

async fn scan_peripherals(adapter: &Adapter, secs: u64) -> Result<Vec<Peripheral>> {
    adapter.start_scan(ScanFilter::default()).await?;
    tokio::time::sleep(Duration::from_secs(secs)).await;
    adapter.stop_scan().await?;
    Ok(adapter.peripherals().await?)
}

async fn find(adapter: &Adapter, id: &str) -> Result<Peripheral> {
    for p in scan_peripherals(adapter, 5).await? {
        if p.id().to_string() == id {
            return Ok(p);
        }
    }
    Err(anyhow!(
        "peripheral {id} not seen in a 5 s scan; run `probe scan` first"
    ))
}

async fn connect(adapter: &Adapter, id: &str) -> Result<Peripheral> {
    let p = find(adapter, id).await?;
    p.connect().await.context("connect")?;
    p.discover_services().await.context("discover services")?;
    Ok(p)
}

async fn scan(secs: u64, name: Option<String>) -> Result<()> {
    let adapter = adapter().await?;
    let mut rows = Vec::new();
    for p in scan_peripherals(&adapter, secs).await? {
        let Some(props) = p.properties().await? else {
            continue;
        };
        let label = props.local_name.clone().unwrap_or_else(|| "-".into());
        if let Some(filter) = &name {
            if !label.to_lowercase().contains(&filter.to_lowercase()) {
                continue;
            }
        }
        let mfr: Vec<String> = props
            .manufacturer_data
            .iter()
            .map(|(k, v)| format!("{k:04X}:{}", to_hex(v)))
            .collect();
        rows.push((
            props.rssi.unwrap_or(i16::MIN),
            format!(
                "{:>4}  {:<24} {}  services={:?}  mfr={:?}",
                props
                    .rssi
                    .map(|r| r.to_string())
                    .unwrap_or_else(|| "?".into()),
                label,
                p.id(),
                props.services,
                mfr
            ),
        ));
    }
    rows.sort_by_key(|(rssi, _)| std::cmp::Reverse(*rssi));
    for (_, line) in &rows {
        println!("{line}");
    }
    println!("{} device(s)", rows.len());
    Ok(())
}

async fn dump(id: &str) -> Result<()> {
    let adapter = adapter().await?;
    let p = connect(&adapter, id).await?;
    for service in p.services() {
        println!("service {}", service.uuid);
        for c in service.characteristics {
            println!("  char {}  {:?}", c.uuid, c.properties);
        }
    }
    p.disconnect().await?;
    Ok(())
}

async fn write(id: &str, characteristic: &str, hex: &str, listen: Option<&str>) -> Result<()> {
    let uuid = parse_uuid(characteristic).map_err(|e| anyhow!(e))?;
    let bytes = parse_hex(hex).map_err(|e| anyhow!(e))?;
    let adapter = adapter().await?;
    let p = connect(&adapter, id).await?;
    let ch = p
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == uuid)
        .ok_or_else(|| anyhow!("characteristic {uuid} not found; run `probe dump {id}`"))?;
    let mut notifications = p.notifications().await?;
    if let Some(l) = listen {
        let nuuid = parse_uuid(l).map_err(|e| anyhow!(e))?;
        let nch = p
            .characteristics()
            .into_iter()
            .find(|c| c.uuid == nuuid)
            .ok_or_else(|| anyhow!("notify characteristic {nuuid} not found"))?;
        p.subscribe(&nch).await?;
    }
    let write_type = write_type(&ch.properties);
    println!("write {} ({write_type:?}) -> {uuid}", to_hex(&bytes));
    p.write(&ch, &bytes, write_type).await?;
    // The timeout elapsing is the normal end of the listening window, not an error.
    let _ = tokio::time::timeout(Duration::from_secs(2), async {
        while let Some(n) = notifications.next().await {
            println!("notify {} {}", n.uuid, to_hex(&n.value));
        }
    })
    .await;
    p.disconnect().await?;
    Ok(())
}

fn write_type(props: &CharPropFlags) -> WriteType {
    if props.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE) {
        WriteType::WithoutResponse
    } else {
        WriteType::WithResponse
    }
}

async fn measure(id: &str, characteristic: &str, hex: &str, n: u32) -> Result<()> {
    let uuid = parse_uuid(characteristic).map_err(|e| anyhow!(e))?;
    let bytes = parse_hex(hex).map_err(|e| anyhow!(e))?;
    let adapter = adapter().await?;
    let p = find(&adapter, id).await?;

    let t = Instant::now();
    p.connect().await.context("connect")?;
    p.discover_services().await.context("discover services")?;
    println!("connect + discover: {} ms", t.elapsed().as_millis());

    let ch = p
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == uuid)
        .ok_or_else(|| anyhow!("characteristic {uuid} not found"))?;
    let wt = write_type(&ch.properties);
    let mut times = Vec::new();
    for _ in 0..n {
        let t = Instant::now();
        p.write(&ch, &bytes, wt).await?;
        times.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    let min = times.iter().cloned().fold(f64::MAX, f64::min);
    let max = times.iter().cloned().fold(f64::MIN, f64::max);
    let avg = times.iter().sum::<f64>() / times.len() as f64;
    println!("{n} writes ({wt:?}): min {min:.1} ms  avg {avg:.1} ms  max {max:.1} ms");
    p.disconnect().await?;
    Ok(())
}

async fn demo(id: &str) -> Result<()> {
    let link = Arc::new(BleLink::new().await?);
    let pool = Pool::new(link, lumen_core::pool::DEFAULT_MAX_LIVE);
    let strip = StripId::new(id);
    let steps: [(&str, Command); 6] = [
        ("power on", Command::Power(true)),
        ("red (hue 0)", Command::Color { hue: 0, sat: 1000 }),
        (
            "green (hue 120)",
            Command::Color {
                hue: 120,
                sat: 1000,
            },
        ),
        (
            "blue (hue 240)",
            Command::Color {
                hue: 240,
                sat: 1000,
            },
        ),
        ("half brightness", Command::Brightness(500)),
        ("power off", Command::Power(false)),
    ];
    for (label, cmd) in steps {
        println!("{label}");
        let report = pool
            .dispatch(vec![Job {
                strip: strip.clone(),
                profile: Arc::new(MrStar),
                cmd,
                calibration: Calibration::default(),
            }])
            .await;
        if !report.unreachable.is_empty() {
            return Err(anyhow!("strip unreachable at step {label:?}"));
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    Ok(())
}

fn parse_command(words: &[String]) -> Result<Command> {
    let w: Vec<&str> = words.iter().map(String::as_str).collect();
    match w.as_slice() {
        ["on"] => Ok(Command::Power(true)),
        ["off"] => Ok(Command::Power(false)),
        ["color", hue, sat] => Ok(Command::Color {
            hue: hue.parse()?,
            sat: sat.parse()?,
        }),
        ["brightness", v] => Ok(Command::Brightness(v.parse()?)),
        _ => Err(anyhow!(
            "COMMAND must be: on | off | color <hue> <sat> | brightness <value>"
        )),
    }
}

fn parse_order(s: &str) -> Result<ChannelOrder> {
    match s.to_ascii_lowercase().as_str() {
        "rgb" => Ok(ChannelOrder::Rgb),
        "rbg" => Ok(ChannelOrder::Rbg),
        "grb" => Ok(ChannelOrder::Grb),
        "gbr" => Ok(ChannelOrder::Gbr),
        "brg" => Ok(ChannelOrder::Brg),
        "bgr" => Ok(ChannelOrder::Bgr),
        other => Err(anyhow!("unknown channel order {other:?}")),
    }
}

async fn send(
    id: &str,
    profile: &str,
    min_brightness: Option<u16>,
    order: &str,
    command: &[String],
) -> Result<()> {
    let profile =
        profile_by_id(profile).ok_or_else(|| anyhow!("unknown profile; run `probe profiles`"))?;
    let cmd = parse_command(command)?;
    let calibration = Calibration {
        channel_order: parse_order(order)?,
        min_brightness: min_brightness.unwrap_or(Calibration::default().min_brightness),
        ..Calibration::default()
    };
    match profile.encode(&cmd, &calibration) {
        Some(bytes) => println!("send {} via {}", to_hex(&bytes), profile.id()),
        None => return Err(anyhow!("profile {} cannot express {cmd:?}", profile.id())),
    }
    let link = Arc::new(BleLink::new().await?);
    let pool = Pool::new(link, DEFAULT_MAX_LIVE);
    let report = pool
        .dispatch(vec![Job {
            strip: StripId::new(id),
            profile,
            cmd,
            calibration,
        }])
        .await;
    // Write-without-response returns when the write is queued, not sent. The process must stay
    // alive for ~1.5 s to allow the radio to deliver the frame; otherwise the OS discards it.
    tokio::time::sleep(Duration::from_millis(1500)).await;
    if report.unreachable.is_empty() {
        Ok(())
    } else {
        Err(anyhow!("strip unreachable"))
    }
}

fn profiles() {
    for p in all_profiles() {
        let c = p.capabilities();
        println!(
            "{:<16} service {} write {}  color={} brightness={}",
            p.id(),
            p.service(),
            p.write_characteristic(),
            c.color,
            c.brightness
        );
    }
}
