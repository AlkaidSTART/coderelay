use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    ExitCode::from(coderelay_cli::run_cli().await.clamp(0, 255) as u8)
}
