use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};
use coderelay_core::{ModelStrength, RoutingMode};

pub mod commands;
pub mod context;
pub mod jev;

#[derive(Debug, Parser)]
#[command(
    name = "coderelay",
    version,
    about = "Route coding tasks to the best available coding agent"
)]
pub struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Route a prompt to an installed coding agent CLI.
    Run(RunCommand),
    /// List coding agents and their discovery status.
    Agents(JsonCommand),
    /// List detected models grouped by agent.
    Models(JsonCommand),
    /// Diagnose configuration, environment, and agent availability.
    Doctor(JsonCommand),
    /// Read or update the favorite initialization agent.
    Favorite(FavoriteCommand),
}

#[derive(Debug, Args)]
struct CommonCliArgs {
    /// Directory used for config discovery and process execution.
    #[arg(short = 'C', long)]
    cwd: Option<PathBuf>,
    /// Explicit config file.
    #[arg(short = 'c', long)]
    config: Option<PathBuf>,
}

#[derive(Debug, Args)]
struct RunCommand {
    /// Prompt to send to the selected agent.
    #[arg(value_name = "PROMPT", required = true, num_args = 1.., trailing_var_arg = true)]
    prompt: Vec<String>,
    /// Explicit agent; bypasses routing.
    #[arg(short = 'a', long)]
    agent: Option<String>,
    /// Explicit model or agent:model reference.
    #[arg(short = 'm', long)]
    model: Option<String>,
    /// Routing mode override.
    #[arg(short = 'M', long, value_parser = parse_routing_mode)]
    mode: Option<RoutingMode>,
    /// Request file used by routing rules.
    #[arg(long = "file")]
    files: Vec<String>,
    /// Request language used by routing rules.
    #[arg(long)]
    language: Option<String>,
    /// Approximate request context size in tokens.
    #[arg(long)]
    context_size: Option<u64>,
    /// Required model strength; repeat for multiple values.
    #[arg(long, value_parser = parse_model_strength, action = clap::ArgAction::Append)]
    strength: Vec<ModelStrength>,
    /// Terminate the selected agent after this timeout.
    #[arg(long)]
    timeout: Option<u64>,
    #[command(flatten)]
    common: CommonCliArgs,
}

#[derive(Debug, Args)]
struct JsonCommand {
    /// Emit stable machine-readable JSON.
    #[arg(long)]
    json: bool,
    #[command(flatten)]
    common: CommonCliArgs,
}

#[derive(Debug, Args)]
struct FavoriteCommand {
    /// Agent id, or "clear"/"none" to clear the preference.
    agent: Option<String>,
    /// Emit stable machine-readable JSON.
    #[arg(long)]
    json: bool,
}

fn parse_routing_mode(value: &str) -> Result<RoutingMode, String> {
    value.parse()
}

fn parse_model_strength(value: &str) -> Result<ModelStrength, String> {
    value.parse()
}

fn common(args: CommonCliArgs) -> commands::CommonArgs {
    commands::CommonArgs {
        cwd: args.cwd,
        config: args.config,
    }
}

pub async fn run_cli() -> i32 {
    let cli = Cli::parse();
    match cli.command {
        Command::Run(args) => {
            commands::run(commands::RunArgs {
                prompt: args.prompt.join(" "),
                agent: args.agent,
                model: args.model,
                mode: args.mode,
                files: args.files,
                language: args.language,
                context_size: args.context_size,
                required_strengths: args.strength,
                timeout_ms: args.timeout,
                common: common(args.common),
            })
            .await
        }
        Command::Agents(args) => commands::agents(common(args.common), args.json).await,
        Command::Models(args) => commands::models(common(args.common), args.json).await,
        Command::Doctor(args) => commands::doctor(common(args.common), args.json).await,
        Command::Favorite(args) => commands::favorite(args.agent, args.json).await,
    }
}
