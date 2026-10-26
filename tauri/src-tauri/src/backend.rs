//! Rust backend module — minimal HTTP health-check server.

use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub backend: String,
}

#[cfg(feature = "rust-backend")]
pub fn start_backend_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))?;
    println!("Rust backend listening on 127.0.0.1:{}", port);

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                let mut reader = match stream.try_clone() {
                    Ok(r) => BufReader::new(r),
                    Err(_) => return Ok(()),
                };
                let mut request_line = String::new();
                if reader.read_line(&mut request_line).is_ok() {
                    let path = request_line
                        .split_whitespace()
                        .nth(1)
                        .unwrap_or("/")
                        .to_string();

                    let (status, body) = match path.as_str() {
                        "/health" => (
                            "200 OK",
                            serde_json::to_string(&HealthResponse {
                                status: "ok".to_string(),
                                version: "0.1.0".to_string(),
                                backend: "rust".to_string(),
                            })
                            .unwrap_or_default(),
                        ),
                        "/health/ready" => (
                            "200 OK",
                            serde_json::to_string(&HealthResponse {
                                status: "ready".to_string(),
                                version: "0.1.0".to_string(),
                                backend: "rust".to_string(),
                            })
                            .unwrap_or_default(),
                        ),
                        _ => ("404 Not Found", r#"{"error":"not found"}"#.to_string()),
                    };

                    let response = format!(
                        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        status,
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes());
                }
            }
            Err(e) => {
                eprintln!("Connection error: {}", e);
            }
        }
    }
    Ok(())
}

#[cfg(feature = "rust-backend")]
#[tauri::command]
pub fn start_rust_backend(port: Option<u16>) -> Result<String, String> {
    let port = port.unwrap_or(17493);
    std::thread::spawn(move || {
        if let Err(e) = start_backend_server(port) {
            eprintln!("Rust backend error: {}", e);
        }
    });
    Ok(format!("Rust backend starting on port {}", port))
}

#[cfg(not(feature = "rust-backend"))]
#[tauri::command]
pub fn start_rust_backend(_port: Option<u16>) -> Result<String, String> {
    Err("Rust backend is disabled (enable the rust-backend feature)".to_string())
}