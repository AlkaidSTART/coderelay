use std::collections::BTreeMap;

use coderelay_core::config::parse_config_yaml;
use coderelay_core::router::jev::{
    JevClient, JevDecision, JevError, JevUsage, build_jev_request, format_candidate_key,
    route_with_jev,
};
use coderelay_core::router::scorer::infer_strengths;
use coderelay_core::{
    AgentId, ModelCost, ModelStrength, RouteCandidate, RouteError, RouteOptions, RouteRequest,
    RouteStrategy, RoutingMode, build_route_candidates, has_ambiguous_route, resolve_routing_mode,
    route, select_candidate,
};

fn candidate(
    agent: AgentId,
    model: Option<&str>,
    strengths: &[ModelStrength],
    is_default: bool,
) -> RouteCandidate {
    RouteCandidate {
        agent,
        model: model.map(str::to_owned),
        label: None,
        strengths: strengths.to_vec(),
        cost: None,
        context_window: None,
        is_default,
    }
}

#[test]
fn hybrid_ambiguity_check_applies_matching_rules() {
    let config = parse_config_yaml(
        r#"
defaultAgent: codex
routing:
  strategy: hybrid
  weights:
    default: 0
    rule: 1
  rules:
    - name: prefer-claude
      priority: 10
      score: 5
      when:
        keywords: [deploy]
      use:
        agent: claude
"#,
    )
    .expect("valid config");
    let candidates = vec![
        candidate(AgentId::Codex, None, &[], false),
        candidate(AgentId::Claude, None, &[], false),
    ];

    assert!(!has_ambiguous_route(
        &RouteRequest {
            prompt: "deploy this change".to_owned(),
            ..RouteRequest::default()
        },
        &config,
        &candidates,
    ));
    assert!(has_ambiguous_route(
        &RouteRequest {
            prompt: "summarize this change".to_owned(),
            ..RouteRequest::default()
        },
        &config,
        &candidates,
    ));
}

#[test]
fn higher_priority_rule_beats_a_larger_lower_priority_score() {
    let config = parse_config_yaml(
        r#"
defaultAgent: codex
routing:
  strategy: hybrid
  rules:
    - name: critical
      priority: 100
      score: 1
      when:
        keywords: [deploy]
      use:
        agent: codex
    - name: fallback
      priority: 0
      score: 20
      when:
        keywords: [deploy]
      use:
        agent: claude
"#,
    )
    .expect("valid config");
    let candidates = vec![
        candidate(AgentId::Codex, None, &[], false),
        candidate(AgentId::Claude, None, &[], true),
    ];

    let decision = route(
        &RouteRequest {
            prompt: "deploy".to_owned(),
            ..RouteRequest::default()
        },
        &config,
        &RouteOptions {
            candidates: Some(candidates),
            ..RouteOptions::default()
        },
    )
    .expect("route");

    assert_eq!(decision.agent, AgentId::Codex);
    assert_eq!(
        decision.matched_rule.expect("matched rule").name,
        "critical"
    );
}

#[test]
fn context_window_reaches_candidates_and_affects_score_routing() {
    let config = parse_config_yaml(
        r#"
defaultAgent: codex
agents:
  codex:
    models:
      - id: fits
        contextWindow: 128000
        cost: 2
        strengths: []
      - id: small
        contextWindow: 8000
        cost: 2
        strengths: []
routing:
  strategy: score
  weights:
    context: 5
    default: 0
"#,
    )
    .expect("valid config");
    let options = RouteOptions {
        available_agents: Some(vec![AgentId::Codex]),
        ..RouteOptions::default()
    };
    let candidates = build_route_candidates(&config, &options);
    assert_eq!(
        candidates
            .iter()
            .find(|candidate| candidate.model.as_deref() == Some("fits"))
            .and_then(|candidate| candidate.context_window),
        Some(128_000)
    );
    assert_eq!(
        candidates
            .iter()
            .find(|candidate| candidate.model.as_deref() == Some("small"))
            .and_then(|candidate| candidate.context_window),
        Some(8_000)
    );

    let decision = route(
        &RouteRequest {
            prompt: "summarize".to_owned(),
            context_size: Some(32_000),
            ..RouteRequest::default()
        },
        &config,
        &options,
    )
    .expect("route");
    assert_eq!(decision.model.as_deref(), Some("fits"));
}

#[test]
fn available_implicit_agents_remain_candidates_but_disabled_agents_do_not() {
    let config = parse_config_yaml("defaultAgent: codex\nagents:\n  pi:\n    enabled: false\n")
        .expect("valid config");
    let options = RouteOptions {
        available_agents: Some(vec![AgentId::Codex, AgentId::Claude, AgentId::Pi]),
        ..RouteOptions::default()
    };
    let candidates = build_route_candidates(&config, &options);
    assert!(
        candidates
            .iter()
            .any(|candidate| candidate.agent == AgentId::Claude)
    );
    assert!(
        !candidates
            .iter()
            .any(|candidate| candidate.agent == AgentId::Pi)
    );

    let without_default = build_route_candidates(
        &config,
        &RouteOptions {
            available_agents: Some(vec![AgentId::Claude, AgentId::Pi]),
            ..RouteOptions::default()
        },
    );
    assert_eq!(without_default.len(), 1);
    assert_eq!(without_default[0].agent, AgentId::Claude);
}

#[test]
fn cost_penalty_can_break_an_otherwise_equal_score() {
    let config = parse_config_yaml(
        r#"
defaultAgent: codex
agents:
  codex:
    models:
      - id: expensive
        strengths: [coding]
        cost: 5
      - id: cheap
        strengths: [coding]
        cost: 1
routing:
  strategy: score
  weights:
    default: 0
    strength: 2
    cost: 3
"#,
    )
    .expect("valid config");
    let decision = route(
        &RouteRequest {
            prompt: "implement the code".to_owned(),
            ..RouteRequest::default()
        },
        &config,
        &RouteOptions {
            available_agents: Some(vec![AgentId::Codex]),
            ..RouteOptions::default()
        },
    )
    .expect("score route");

    assert_eq!(decision.model.as_deref(), Some("cheap"));
    assert!(decision.score > 0.0);
}

#[test]
fn strength_keywords_match_tokens_not_substrings() {
    assert!(
        infer_strengths(&RouteRequest {
            prompt: "the quick brown fox".to_owned(),
            ..RouteRequest::default()
        })
        .contains(&ModelStrength::Fast)
    );
    assert!(
        !infer_strengths(&RouteRequest {
            prompt: "We ate breakfast before the review".to_owned(),
            ..RouteRequest::default()
        })
        .contains(&ModelStrength::Fast)
    );
    assert!(
        infer_strengths(&RouteRequest {
            prompt: "design a system".to_owned(),
            ..RouteRequest::default()
        })
        .contains(&ModelStrength::Reasoning)
    );
    assert!(
        !infer_strengths(&RouteRequest {
            prompt: "undesigned output".to_owned(),
            ..RouteRequest::default()
        })
        .contains(&ModelStrength::Reasoning)
    );
}

#[test]
fn rules_strategy_matches_keywords_and_file_globs() {
    let config = parse_config_yaml(
        r#"
defaultAgent: codex
routing:
  strategy: rules
  rules:
    - name: rust-deploy
      priority: 10
      when:
        keywords: [deploy]
        files: ["src/**/*.rs"]
      use:
        agent: claude
"#,
    )
    .expect("valid config");
    let candidates = vec![
        candidate(AgentId::Codex, None, &[], true),
        candidate(AgentId::Claude, None, &[], false),
    ];
    let options = RouteOptions {
        candidates: Some(candidates),
        ..RouteOptions::default()
    };

    let matched = route(
        &RouteRequest {
            prompt: "deploy the service".to_owned(),
            files: Some(vec!["src/router/mod.rs".to_owned()]),
            ..RouteRequest::default()
        },
        &config,
        &options,
    )
    .expect("matched route");
    assert_eq!(matched.agent, AgentId::Claude);

    let fallback = route(
        &RouteRequest {
            prompt: "deploy the service".to_owned(),
            files: Some(vec!["docs/readme.md".to_owned()]),
            ..RouteRequest::default()
        },
        &config,
        &options,
    )
    .expect("fallback route");
    assert_eq!(fallback.agent, AgentId::Codex);
    assert_eq!(fallback.strategy, RouteStrategy::Rules);
}

#[test]
fn rules_strategy_refuses_to_silently_fallback_from_an_unavailable_target() {
    let config = parse_config_yaml(
        r#"
defaultAgent: codex
routing:
  strategy: rules
  rules:
    - name: deploy-claude
      when:
        keywords: [deploy]
      use:
        agent: claude
"#,
    )
    .expect("valid config");
    let error = route(
        &RouteRequest {
            prompt: "deploy".to_owned(),
            ..RouteRequest::default()
        },
        &config,
        &RouteOptions {
            candidates: Some(vec![candidate(AgentId::Codex, None, &[], true)]),
            ..RouteOptions::default()
        },
    )
    .expect_err("missing target must fail");

    assert!(matches!(error, RouteError::RuleTargetUnavailable { .. }));
    assert!(error.to_string().contains("refusing silent fallback"));
}

#[test]
fn explicit_model_selection_stays_exact_with_multiple_agent_models() {
    let config = parse_config_yaml(
        r#"
defaultAgent: codex
agents:
  codex:
    models:
      - id: gpt-5
        strengths: [coding]
      - id: o3-mini
        strengths: [fast]
"#,
    )
    .expect("valid config");
    let candidates = build_route_candidates(
        &config,
        &RouteOptions {
            available_agents: Some(vec![AgentId::Codex]),
            ..RouteOptions::default()
        },
    );
    let selected =
        select_candidate(&candidates, Some(AgentId::Codex), Some("o3-mini")).expect("exact model");
    assert_eq!(selected.model.as_deref(), Some("o3-mini"));
}

#[test]
fn routing_mode_override_and_candidate_keys_are_stable() {
    assert_eq!(
        resolve_routing_mode(RoutingMode::Local, Some(RoutingMode::Jev)),
        RoutingMode::Jev
    );
    assert_eq!(
        format_candidate_key(&candidate(AgentId::Codex, Some("gpt-5"), &[], true)),
        "codex:gpt-5"
    );
}

#[test]
fn jev_request_contains_non_empty_candidate_metadata() {
    let candidates = vec![
        RouteCandidate {
            agent: AgentId::Claude,
            model: None,
            label: Some("Claude Code".to_owned()),
            strengths: vec![ModelStrength::Reasoning, ModelStrength::Coding],
            cost: Some(ModelCost::Two),
            context_window: Some(128_000),
            is_default: true,
        },
        RouteCandidate {
            agent: AgentId::Codex,
            model: Some("o3-mini".to_owned()),
            label: Some("Codex Fast".to_owned()),
            strengths: vec![ModelStrength::Fast],
            cost: Some(ModelCost::One),
            context_window: Some(32_000),
            is_default: false,
        },
    ];
    let request = build_jev_request(
        &RouteRequest {
            prompt: "Fix bug in backend".to_owned(),
            language: Some("typescript".to_owned()),
            files: Some(vec!["src/router.rs".to_owned()]),
            context_size: Some(24_000),
            required_strengths: Some(vec![ModelStrength::Coding]),
        },
        &candidates,
        "jev-latest",
    );

    assert!(request.state.contains("Language: typescript"));
    assert!(request.state.contains("Files: src/router.rs"));
    assert!(request.state.contains("Required strengths: coding"));
    let criteria = &request.questions["decision"].criteria;
    assert!(criteria["claude"].contains("cost: 2/5"));
    assert!(criteria["codex:o3-mini"].contains("context window: 32000 tokens"));
}

struct FakeJevClient;

impl JevClient for FakeJevClient {
    async fn decide(
        &self,
        _request: &RouteRequest,
        candidates: &[RouteCandidate],
    ) -> Result<JevDecision, JevError> {
        let candidate = candidates[0].clone();
        Ok(JevDecision {
            agent: candidate.agent,
            model: candidate.model.clone(),
            candidate,
            confidence: 0.92,
            probabilities: BTreeMap::from([("claude".to_owned(), 0.92)]),
            raw_choice: "claude".to_owned(),
            model_name: "jev-1.13.0".to_owned(),
            usage: Some(JevUsage {
                input_tokens: 310,
                output_tokens: 28,
            }),
        })
    }
}

#[test]
fn jev_client_boundary_maps_to_a_standard_route_decision() {
    let candidates = vec![candidate(AgentId::Claude, None, &[], true)];
    let decision = futures::executor::block_on(route_with_jev(
        &RouteRequest {
            prompt: "plan the migration".to_owned(),
            ..RouteRequest::default()
        },
        &candidates,
        &FakeJevClient,
    ))
    .expect("jev route");

    assert_eq!(decision.strategy, RouteStrategy::Jev);
    assert_eq!(decision.agent, AgentId::Claude);
    assert!((decision.score - 0.92).abs() < f64::EPSILON);
    assert!(decision.reasons[0].contains("92% confidence"));
}
