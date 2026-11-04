use std::process::ExitCode;

use clap::{Parser, Subcommand};
use coderelay_core::{AgentDescriptor, CORE_VERSION, supported_agents};
use coderelay_protocol::PROTOCOL_VERSION;
use serde::Serialize;

#[derive(Debug, Parser)]
#[command(
    name = "coderelay",
    version,
    about = "Route coding tasks to the best available coding agent"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// List built-in coding agents.
    Agents {
        /// Emit the versioned machine-readable shape.
        #[arg(long)]
        json: bool,
    },
    /// Report core and protocol readiness.
    Doctor {
        /// Emit a machine-readable report.
        #[arg(long)]
        json: bool,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctorReport {
    core_version: &'static str,
    protocol_version: u32,
    transport: &'static str,
    status: &'static str,
}

fn print_agents(json_output: bool) -> Result<(), serde_json::Error> {
    let agents: Vec<AgentDescriptor> = supported_agents();
    if json_output {
        println!("{}", serde_json::to_string_pretty(&agents)?);
        return Ok(());
    }

    for agent in agents {
        println!(
            "{:<8} {:<12} {}",
            agent.id.as_str(),
            agent.binary,
            agent.display_name
        );
    }
    Ok(())
}

fn doctor(json_output: bool) -> Result<(), serde_json::Error> {
    let report = DoctorReport {
        core_version: CORE_VERSION,
        protocol_version: PROTOCOL_VERSION,
        transport: "in-process",
        status: "scaffold",
    };

    if json_output {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("core: {}", report.core_version);
        println!("protocol: {}", report.protocol_version);
        println!("transport: {}", report.transport);
        println!("status: {}", report.status);
    }
    Ok(())
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let result = match cli.command {
        Command::Agents { json } => print_agents(json),
        Command::Doctor { json } => doctor(json),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("coderelay: failed to serialize output: {error}");
            ExitCode::FAILURE
        }
    }
}
