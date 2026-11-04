use std::fs;
use std::path::Path;

use coderelay_core::config::{
    CONFIG_FILE_NAMES, LoadConfigOptions, default_config, find_config_path, load_config,
    parse_config_yaml,
};
use coderelay_core::{AgentId, ModelCost, ModelStrength, RoutingMode, RoutingStrategy};
use tempfile::TempDir;

fn write(path: &Path, text: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create fixture directory");
    }
    fs::write(path, text).expect("write fixture");
}

#[test]
fn empty_config_uses_documented_defaults() {
    let config = parse_config_yaml("{}").expect("parse empty mapping");

    assert_eq!(config.version, 1);
    assert_eq!(config.default_agent, AgentId::Codex);
    assert!(config.default_model.is_none());
    assert!(config.agents.is_empty());
    assert_eq!(config.routing.mode, RoutingMode::Local);
    assert_eq!(config.routing.strategy, RoutingStrategy::Hybrid);
    assert_eq!(config.routing.weights.strength, 1.0);
    assert_eq!(config.routing.weights.rule, 1.0);
    assert_eq!(config.routing.weights.default, 2.0);
    assert_eq!(config.routing.weights.cost, 0.5);
    assert_eq!(config.routing.weights.context, 1.0);
}

#[test]
fn valid_yaml_preserves_non_empty_model_metadata_and_rules() {
    let config = parse_config_yaml(
        r#"
version: 1
defaultAgent: claude
defaultModel: claude:sonnet
agents:
  claude:
    enabled: true
    activationDecided: true
    command: /opt/homebrew/bin/claude
    extraArgs: ["--verbose"]
    env:
      ANTHROPIC_BASE_URL: https://example.test
    models:
      - id: sonnet
        label: Claude Sonnet
        strengths: [coding, tool-use, long-context]
        description: balanced coding model
        contextWindow: 200000
        cost: 3
        default: true
routing:
  mode: local
  strategy: hybrid
  rules:
    - name: long refactor
      description: route deep refactors
      priority: 20
      when:
        keywords: [refactor, 重构]
        patterns: ["(?i)architecture"]
        languages: [rust]
        files: ["src/**/*.rs"]
        minPromptLength: 100
        maxPromptLength: 5000
      use:
        agent: claude
        model: sonnet
      score: 25
  weights:
    strength: 1.5
    rule: 1
    default: 2
    cost: 0.5
    context: 2
"#,
    )
    .expect("parse valid config");

    let model = &config.agents[&AgentId::Claude].models[0];
    assert_eq!(model.id, "sonnet");
    assert_eq!(model.label.as_deref(), Some("Claude Sonnet"));
    assert_eq!(
        model.strengths,
        vec![
            ModelStrength::Coding,
            ModelStrength::ToolUse,
            ModelStrength::LongContext
        ]
    );
    assert_eq!(model.context_window, Some(200_000));
    assert_eq!(model.cost, Some(ModelCost::Three));
    assert_eq!(model.default, Some(true));

    let rule = &config.routing.rules[0];
    assert_eq!(rule.priority, 20);
    assert_eq!(rule.score, 25.0);
    assert_eq!(rule.r#use.agent, Some(AgentId::Claude));
    assert_eq!(rule.r#use.model.as_deref(), Some("sonnet"));
    assert_eq!(
        rule.when.as_ref().expect("rule when").min_prompt_length,
        Some(100)
    );
}

#[test]
fn invalid_agents_strengths_costs_and_context_are_rejected() {
    let cases = [
        ("defaultAgent: unknown\n", "unsupported agent id"),
        (
            "agents:\n  claude:\n    models:\n      - id: sonnet\n        strengths: [unknown]\n",
            "unknown variant",
        ),
        (
            "agents:\n  claude:\n    models:\n      - id: sonnet\n        cost: 6\n",
            "cost must be between 1 and 5",
        ),
        (
            "agents:\n  claude:\n    models:\n      - id: sonnet\n        contextWindow: 0\n",
            "contextWindow must be positive",
        ),
    ];

    for (yaml, expected) in cases {
        let error = parse_config_yaml(yaml).expect_err("fixture must be rejected");
        assert!(
            error.to_string().contains(expected),
            "expected {expected:?} in {error}"
        );
    }
}

#[test]
fn duplicate_and_ambiguous_model_defaults_are_rejected() {
    let duplicate =
        parse_config_yaml("agents:\n  codex:\n    models:\n      - id: gpt-5\n      - id: gpt-5\n")
            .expect_err("duplicate model ids must fail");
    assert!(duplicate.to_string().contains("duplicate model id"));

    let multiple_defaults = parse_config_yaml(
        "agents:\n  codex:\n    models:\n      - id: a\n        default: true\n      - id: b\n        default: true\n",
    )
    .expect_err("multiple defaults must fail");
    assert!(
        multiple_defaults
            .to_string()
            .contains("multiple default models")
    );
}

#[test]
fn rule_and_default_model_references_are_validated() {
    let invalid_regex = parse_config_yaml(
        "routing:\n  rules:\n    - name: bad\n      when:\n        patterns: ['[']\n      use:\n        agent: codex\n",
    )
    .expect_err("invalid regex must fail");
    assert!(
        invalid_regex
            .to_string()
            .contains("valid regular expression")
    );

    let invalid_range = parse_config_yaml(
        "routing:\n  rules:\n    - name: range\n      when:\n        minPromptLength: 10\n        maxPromptLength: 5\n      use:\n        agent: codex\n",
    )
    .expect_err("inverted range must fail");
    assert!(invalid_range.to_string().contains("minPromptLength"));

    let empty_target = parse_config_yaml("routing:\n  rules:\n    - name: empty\n      use: {}\n")
        .expect_err("empty rule target must fail");
    assert!(
        empty_target
            .to_string()
            .contains("at least an agent or a model")
    );

    let wrong_default = parse_config_yaml(
        "defaultAgent: codex\ndefaultModel: claude:sonnet\nagents:\n  claude:\n    models:\n      - id: sonnet\n",
    )
    .expect_err("defaultModel must target defaultAgent");
    assert!(wrong_default.to_string().contains("defaultAgent"));

    let unknown_model_only = parse_config_yaml(
        "agents:\n  codex:\n    models:\n      - id: gpt-5\nrouting:\n  rules:\n    - name: model-only\n      use:\n        model: missing\n",
    )
    .expect_err("model-only target must exist on an enabled agent");
    assert!(
        unknown_model_only
            .to_string()
            .contains("model is not configured for any enabled agent")
    );
}

#[test]
fn disabled_default_agent_is_rejected_only_when_another_agent_is_enabled() {
    let mixed = parse_config_yaml(
        "defaultAgent: codex\nagents:\n  codex:\n    enabled: false\n  claude:\n    enabled: true\n",
    )
    .expect_err("disabled default with another enabled agent must fail");
    assert!(mixed.to_string().contains("is disabled"));

    let all_disabled = parse_config_yaml(
        "defaultAgent: codex\nagents:\n  codex:\n    enabled: false\n  claude:\n    enabled: false\n",
    )
    .expect("all agents disabled is a legal state");
    assert!(!all_disabled.agents[&AgentId::Codex].enabled);
}

#[test]
fn find_and_load_config_use_nearest_workspace_file() {
    let temp = TempDir::new().expect("temp dir");
    let workspace = temp.path().join("workspace");
    let nested = workspace.join("crates").join("app");
    fs::create_dir_all(&nested).expect("nested workspace");
    let config_path = workspace.join(CONFIG_FILE_NAMES[0]);
    write(&config_path, "defaultAgent: pi\n");

    let options = LoadConfigOptions::new(&nested).with_home_dir(temp.path().join("home"));
    let found = find_config_path(
        &nested,
        options.home_dir.as_deref(),
        options.coderelay_home.as_deref(),
    )
    .expect("find config");
    assert_eq!(found, config_path);

    let loaded = load_config(&options).expect("load config");
    assert_eq!(loaded.path.as_deref(), Some(config_path.as_path()));
    assert_eq!(loaded.config.default_agent, AgentId::Pi);
    assert!(!loaded.used_defaults);
}

#[test]
fn load_config_falls_back_to_global_config_then_defaults() {
    let temp = TempDir::new().expect("temp dir");
    let workspace = temp.path().join("workspace");
    fs::create_dir_all(&workspace).expect("workspace");
    let home = temp.path().join("home");
    let global = home.join(".coderelay").join("config.yaml");
    write(&global, "agents:\n  claude:\n    enabled: false\n");

    let loaded = load_config(&LoadConfigOptions::new(&workspace).with_home_dir(home))
        .expect("load global config");
    assert_eq!(loaded.path.as_deref(), Some(global.as_path()));
    assert!(!loaded.config.agents[&AgentId::Claude].enabled);

    let missing = load_config(
        &LoadConfigOptions::new(&workspace).with_home_dir(temp.path().join("missing-home")),
    )
    .expect("missing config is allowed");
    assert!(missing.path.is_none());
    assert!(missing.used_defaults);
    assert_eq!(missing.config, default_config());
}

#[test]
fn malformed_yaml_and_invalid_config_include_the_source_path() {
    let temp = TempDir::new().expect("temp dir");
    let config_path = temp.path().join("config.yaml");
    write(&config_path, "agents: [\n");

    let error = load_config(&LoadConfigOptions::new(temp.path()).with_path(&config_path))
        .expect_err("malformed yaml must fail");
    assert!(error.to_string().contains("invalid YAML"));
    assert!(error.to_string().contains("config.yaml"));

    write(
        &config_path,
        "agents:\n  codex:\n    models:\n      - id: ''\n",
    );
    let error = load_config(&LoadConfigOptions::new(temp.path()).with_path(&config_path))
        .expect_err("empty model id must fail");
    assert!(error.to_string().contains("invalid config"));
    assert!(error.to_string().contains("model id must not be empty"));
}

#[test]
fn config_source_save_is_validate_then_atomic_and_preserves_non_empty_values() {
    use coderelay_core::config::{render_default_config_yaml, save_config_source};

    let temp = TempDir::new().expect("temp dir");
    let path = temp.path().join(".coderelay/config.yaml");
    let raw_default = render_default_config_yaml().expect("render default");
    assert!(raw_default.contains("defaultAgent"));
    assert!(raw_default.contains("routing"));

    let raw = r#"
version: 1
defaultAgent: claude
agents:
  claude:
    models:
      - id: sonnet
        strengths: [coding, long-context]
        cost: 3
        contextWindow: 200000
routing:
  strategy: hybrid
  rules:
    - name: preserve
      when:
        keywords: [refactor]
      use:
        agent: claude
        model: sonnet
"#;
    save_config_source(&path, raw).expect("save config");
    assert_eq!(fs::read_to_string(&path).expect("read"), raw);
    let loaded =
        load_config(&LoadConfigOptions::new(temp.path()).with_path(&path)).expect("load saved");
    assert_eq!(loaded.config.default_agent, AgentId::Claude);
    assert_eq!(
        loaded.config.agents[&AgentId::Claude].models[0].cost,
        Some(ModelCost::Three)
    );

    let invalid = "defaultAgent: claude\nagents:\n  claude:\n    models:\n      - id: ''\n";
    let error =
        save_config_source(&path, invalid).expect_err("invalid config must not replace file");
    assert!(error.to_string().contains("model id must not be empty"));
    assert_eq!(fs::read_to_string(&path).expect("read unchanged"), raw);
}
