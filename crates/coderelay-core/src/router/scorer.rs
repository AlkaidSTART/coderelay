use std::cmp::Ordering;

use crate::config::RoutingWeights;
use crate::model::ModelStrength;
use crate::router::rules::match_rules_for_candidate;
use crate::router::types::{RouteCandidate, RouteRequest, RuleMatch, ScoredCandidate};

/// Keyword groups used to infer model strengths from a request.
pub const STRENGTH_KEYWORDS: [(ModelStrength, &[&str]); 8] = [
    (
        ModelStrength::Coding,
        &[
            "code",
            "bug",
            "refactor",
            "implement",
            "typescript",
            "javascript",
            "python",
            "rust",
            "go",
            "api",
            "test",
        ],
    ),
    (
        ModelStrength::Reasoning,
        &[
            "architecture",
            "design",
            "analyze",
            "reason",
            "complex",
            "tradeoff",
            "plan",
            "debug",
        ],
    ),
    (
        ModelStrength::LongContext,
        &[
            "repository",
            "codebase",
            "entire project",
            "all files",
            "large context",
            "long context",
        ],
    ),
    (
        ModelStrength::ToolUse,
        &[
            "run", "terminal", "command", "git", "search", "inspect", "execute", "file",
        ],
    ),
    (
        ModelStrength::Fast,
        &["quick", "fast", "simple", "small", "typo", "brief"],
    ),
    (
        ModelStrength::Cheap,
        &["cheap", "budget", "minimal", "simple"],
    ),
    (
        ModelStrength::Creative,
        &["creative", "write", "story", "brainstorm", "name", "copy"],
    ),
    (
        ModelStrength::Multimodal,
        &["image", "screenshot", "diagram", "vision", "photo", "video"],
    ),
];

fn includes_keyword(prompt: &str, keyword: &str) -> bool {
    if keyword.is_empty() {
        return false;
    }

    let escaped = keyword
        .to_lowercase()
        .split_whitespace()
        .map(regex::escape)
        .collect::<Vec<_>>()
        .join(r"\s+");
    let pattern = format!(r"(?:^|[^\p{{L}}\p{{N}}_]){escaped}(?:$|[^\p{{L}}\p{{N}}_])");
    regex::Regex::new(&pattern).is_ok_and(|regex| regex.is_match(&prompt.to_lowercase()))
}

/// Infer model strengths from a routing request.
pub fn infer_strengths(request: &RouteRequest) -> Vec<ModelStrength> {
    let mut inferred = Vec::new();

    if let Some(required) = &request.required_strengths {
        for strength in required {
            if !inferred.contains(strength) {
                inferred.push(*strength);
            }
        }
    }

    for (strength, keywords) in STRENGTH_KEYWORDS {
        if keywords
            .iter()
            .any(|keyword| includes_keyword(&request.prompt, keyword))
            && !inferred.contains(&strength)
        {
            inferred.push(strength);
        }
    }

    if request.context_size.unwrap_or(0) >= 100_000
        && !inferred.contains(&ModelStrength::LongContext)
    {
        inferred.push(ModelStrength::LongContext);
    }

    inferred
}

fn default_bonus(candidate: &RouteCandidate, weights: &RoutingWeights) -> f64 {
    if candidate.is_default {
        weights.default
    } else {
        0.0
    }
}

fn strength_bonus(
    strengths: &[ModelStrength],
    candidate: &RouteCandidate,
    weights: &RoutingWeights,
) -> f64 {
    strengths
        .iter()
        .filter(|strength| candidate.strengths.contains(strength))
        .count() as f64
        * weights.strength
}

fn cost_penalty(candidate: &RouteCandidate, weights: &RoutingWeights) -> f64 {
    candidate
        .cost
        .map(|cost| (u8::from(cost).saturating_sub(1) as f64) * weights.cost)
        .unwrap_or(0.0)
}

fn context_bonus(
    request: &RouteRequest,
    candidate: &RouteCandidate,
    strengths: &[ModelStrength],
    weights: &RoutingWeights,
) -> f64 {
    let needs_long_context = strengths.contains(&ModelStrength::LongContext)
        || request.context_size.unwrap_or(0) >= 100_000;
    let fits_requested_context = request
        .context_size
        .zip(candidate.context_window)
        .is_some_and(|(requested, available)| available >= requested);
    let has_known_too_small_window = request
        .context_size
        .zip(candidate.context_window)
        .is_some_and(|(requested, available)| available < requested);

    if has_known_too_small_window {
        return -weights.context;
    }

    if fits_requested_context
        || (needs_long_context && candidate.strengths.contains(&ModelStrength::LongContext))
    {
        weights.context
    } else {
        0.0
    }
}

fn rule_bonus(matches: &[RuleMatch], weights: &RoutingWeights) -> f64 {
    let Some(highest_priority) = matches.first().map(|matched| matched.rule.priority) else {
        return 0.0;
    };

    matches
        .iter()
        .filter(|matched| matched.rule.priority == highest_priority)
        .map(|matched| matched.rule.score * weights.rule)
        .sum()
}

fn strength_reason(strengths: &[ModelStrength], candidate: &RouteCandidate) -> String {
    let matched = strengths
        .iter()
        .filter(|strength| candidate.strengths.contains(strength))
        .map(|strength| strength.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    format!("strength match: {matched}")
}

pub fn score_candidate(
    request: &RouteRequest,
    candidate: &RouteCandidate,
    weights: &RoutingWeights,
    rules: &[crate::config::RouteRule],
    strengths: &[ModelStrength],
) -> ScoredCandidate {
    let rule_matches = match_rules_for_candidate(request, candidate, rules);
    let mut reasons = Vec::new();
    let mut score = 0.0;

    let default_score = default_bonus(candidate, weights);
    if default_score != 0.0 {
        score += default_score;
        reasons.push("default target bonus".to_owned());
    }

    let strength_score = strength_bonus(strengths, candidate, weights);
    if strength_score != 0.0 {
        score += strength_score;
        reasons.push(strength_reason(strengths, candidate));
    }

    let penalty = cost_penalty(candidate, weights);
    if penalty != 0.0 {
        score -= penalty;
        reasons.push("cost penalty".to_owned());
    }

    let context_score = context_bonus(request, candidate, strengths, weights);
    if context_score != 0.0 {
        score += context_score;
        reasons.push("long-context bonus".to_owned());
    }

    let score_from_rules = rule_bonus(&rule_matches, weights);
    if score_from_rules != 0.0 {
        score += score_from_rules;
        reasons.extend(rule_matches.iter().map(|matched| matched.reason.clone()));
    }

    ScoredCandidate {
        candidate: candidate.clone(),
        score,
        rule_matches,
        reasons,
    }
}

pub fn score_candidates(
    request: &RouteRequest,
    candidates: &[RouteCandidate],
    weights: &RoutingWeights,
    rules: &[crate::config::RouteRule],
) -> Vec<ScoredCandidate> {
    let strengths = infer_strengths(request);
    candidates
        .iter()
        .map(|candidate| score_candidate(request, candidate, weights, rules, &strengths))
        .collect()
}

/// Stable comparison used by all local routing strategies.
pub fn compare_scores(left: &ScoredCandidate, right: &ScoredCandidate) -> Ordering {
    let left_priority = left
        .rule_matches
        .first()
        .map(|matched| matched.rule.priority)
        .unwrap_or(i32::MIN);
    let right_priority = right
        .rule_matches
        .first()
        .map(|matched| matched.rule.priority)
        .unwrap_or(i32::MIN);

    right_priority
        .cmp(&left_priority)
        .then_with(|| right.score.total_cmp(&left.score))
        .then_with(|| right.candidate.is_default.cmp(&left.candidate.is_default))
        .then_with(|| left.candidate.agent.cmp(&right.candidate.agent))
}
