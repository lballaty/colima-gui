#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{command, Window};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Finds the colima binary path, checking common installation locations.
/// Returns absolute path to colima binary or error if not found.
///
/// Checked locations (in order):
/// 1. COLIMA_PATH environment variable (allows user override)
/// 2. /opt/homebrew/bin/colima (Apple Silicon Homebrew)
/// 3. /usr/local/bin/colima (Intel Homebrew)
/// 4. ~/bin/colima (user local install)
/// 5. ~/.local/bin/colima (user local install)
/// 6. /usr/bin/colima (system install)
/// 7. /bin/colima (system install)
fn find_colima_binary() -> Result<PathBuf, String> {
    // Check COLIMA_PATH environment variable first (user override)
    if let Ok(env_path) = std::env::var("COLIMA_PATH") {
        let path = PathBuf::from(&env_path);
        if path.exists() {
            return Ok(path);
        }
    }

    // Common installation paths to check
    let paths_to_check = vec![
        "/opt/homebrew/bin/colima",    // Apple Silicon Homebrew
        "/usr/local/bin/colima",        // Intel Homebrew
        "/usr/bin/colima",              // System install
        "/bin/colima",                  // System install
    ];

    // Check standard paths
    for path_str in paths_to_check {
        let path = PathBuf::from(path_str);
        if path.exists() {
            return Ok(path);
        }
    }

    // Check user home directory paths
    if let Some(home_dir) = dirs::home_dir() {
        let user_paths = vec![
            home_dir.join("bin/colima"),
            home_dir.join(".local/bin/colima"),
        ];

        for path in user_paths {
            if path.exists() {
                return Ok(path);
            }
        }
    }

    Err(format!(
        "colima binary not found in common locations.\n\
         Checked:\n\
         - COLIMA_PATH environment variable\n\
         - /opt/homebrew/bin/colima\n\
         - /usr/local/bin/colima\n\
         - /usr/bin/colima\n\
         - ~/bin/colima\n\
         - ~/.local/bin/colima\n\
         \n\
         Please install colima via Homebrew: brew install colima\n\
         Or set COLIMA_PATH environment variable to the binary location."
    ))
}

/// Represents a Colima VM profile with its configuration and status.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ColimaProfile {
    /// Profile name (e.g., "default", "app", "personal-dev")
    name: String,
    /// Current status ("Running" or "Stopped")
    status: String,
    /// Architecture (e.g., "aarch64", "x86_64")
    arch: String,
    /// Number of CPUs allocated
    cpus: String,
    /// Memory allocated (e.g., "8GiB")
    memory: String,
    /// Disk space allocated (e.g., "100GiB")
    disk: String,
    /// Container runtime (e.g., "docker", "containerd"), empty if stopped
    runtime: Option<String>,
    /// IP address if running, None if stopped
    address: Option<String>,
}

#[command]
async fn start_colima(window: Window, profile: String, debug: bool) -> Result<(), String> {
    let command = format!("colima start {}", profile);
    stream_command_output(window, &command, debug).await
}

#[command]
async fn stop_colima(window: Window, profile: String, debug: bool) -> Result<(), String> {
    let command = format!("colima stop {}", profile);
    stream_command_output(window, &command, debug).await
}

#[command]
async fn restart_colima(window: Window, profile: String, debug: bool) -> Result<(), String> {
    let command = format!("colima restart {}", profile);
    stream_command_output(window, &command, debug).await
}

#[command]
async fn status_colima(window: Window, profile: String, debug: bool) -> Result<(), String> {
    let command = format!("colima status {}", profile);
    stream_command_output(window, &command, debug).await
}

#[command]
async fn delete_colima(window: Window, profile: String, debug: bool) -> Result<(), String> {
    let command = format!("colima delete {}", profile);
    stream_command_output(window, &command, debug).await
}

#[command]
async fn list_colima(window: Window, debug: bool) -> Result<(), String> {
    stream_command_output(window, "colima list", debug).await
}

#[command]
async fn prune_colima(window: Window, debug: bool) -> Result<(), String> {
    stream_command_output(window, "colima prune -f", debug).await
}

#[command]
async fn version_colima(window: Window, debug: bool) -> Result<(), String> {
    stream_command_output(window, "colima version", debug).await
}

/// Fetches and parses all Colima profiles.
/// Returns a list of profiles with their current status and configuration.
#[command]
async fn list_profiles() -> Result<Vec<ColimaProfile>, String> {
    // Find colima binary with absolute path
    let colima_path = find_colima_binary()?;

    let output = tokio::process::Command::new(colima_path)
        .arg("list")
        .output()
        .await
        .map_err(|e| format!("Failed to execute colima list: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut profiles = Vec::new();

    // Skip header line and parse each profile
    for line in stdout.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();

        // colima list output: PROFILE STATUS ARCH CPUS MEMORY DISK [RUNTIME] [ADDRESS]
        if parts.len() >= 6 {
            let profile = ColimaProfile {
                name: parts[0].to_string(),
                status: parts[1].to_string(),
                arch: parts[2].to_string(),
                cpus: parts[3].to_string(),
                memory: parts[4].to_string(),
                disk: parts[5].to_string(),
                runtime: parts.get(6).map(|s| s.to_string()),
                address: parts.get(7).map(|s| s.to_string()),
            };
            profiles.push(profile);
        }
    }

    Ok(profiles)
}

#[command]
fn open_config(profile: String) -> Result<String, String> {
    let config_path = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(format!(".colima/{}/colima.yaml", profile));

    if config_path.exists() {
        std::process::Command::new("open")
            .arg(config_path)
            .output()
            .map_err(|e| e.to_string())?;
        Ok(format!("Opening configuration file for {}", profile))
    } else {
        Err(format!("Configuration file not found for profile: {}", profile))
    }
}

async fn stream_command_output(window: Window, command: &str, debug: bool) -> Result<(), String> {
    println!("Running command: {} with debug: {}", command, debug);

    // Find colima binary and replace "colima" in command with absolute path
    let colima_path = find_colima_binary()?;
    let command_with_path = command.replace("colima", colima_path.to_str().unwrap());

    println!("Resolved command: {}", command_with_path);

    let mut cmd = Command::new("sh")
        .arg("-c")
        .arg(&command_with_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = cmd.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = cmd.stderr.take().ok_or("Failed to capture stderr")?;
    let mut reader = BufReader::new(stdout).lines();
    let mut err_reader = BufReader::new(stderr).lines();

    let window_clone = window.clone();
    tokio::spawn(async move {
        let re = Regex::new(r#"msg="([^"]*)""#).unwrap();
        while let Some(line) = reader.next_line().await.unwrap_or(None) {
            println!("STDOUT line: {}", line); // Debugging print
            if let Some(caps) = re.captures(&line) {
                let message = caps.get(1).map_or("", |m| m.as_str());
                println!("Captured message: {}", message); // Debugging print
                window_clone.emit("command-output", message.to_string()).unwrap();
            } else {
                window_clone.emit("command-output", line).unwrap(); // Emit full line if no match
            }
        }
    });

    tokio::spawn(async move {
        let re = Regex::new(r#"msg="([^"]*)""#).unwrap();
        while let Some(line) = err_reader.next_line().await.unwrap_or(None) {
            println!("STDERR line: {}", line); // Debugging print
            if let Some(caps) = re.captures(&line) {
                let message = caps.get(1).map_or("", |m| m.as_str());
                println!("Captured message: {}", message); // Debugging print
                window.emit("command-output", message.to_string()).unwrap();
            } else {
                window.emit("command-output", line).unwrap(); // Emit full line if no match
            }
        }
    });

    let status = cmd.wait().await.map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Command failed".into())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            start_colima,
            stop_colima,
            restart_colima,
            status_colima,
            delete_colima,
            list_colima,
            list_profiles,
            prune_colima,
            version_colima,
            open_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
