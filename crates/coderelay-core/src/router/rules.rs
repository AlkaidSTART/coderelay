use regex::{Regex, RegexBuilder};

use crate::config::{RouteRule, RuleWhen};
use crate::router::types::{RouteCandidate, RouteRequest, RuleMatch};

/// Convert a shell-style routing glob to an anchored regular expression.
pub fn glob_to_regex(glob: &str) -> Result<Regex, regex::Error> {
    let normalized = glob.replace('\\', "/");
    let characters: Vec<char> = normalized.chars().collect();
    let mut source = String::from("^");
    let mut index = 0;

    while index < characters.len() {
        let character = characters[index];
        let next = characters.get(index + 1).copied();

        if character == '*' && next == Some('*') {
            if characters.get(index + 2) == Some(&'/') {
                source.push_str("(?:.*/)?");
                index += 3;
                continue;
            }
            source.push_str(".*");
            index += 2;
            continue;
        }

        match character {
            '*' => source.push_str("[^/]*"),
            '?' => source.push_str("[^/]"),
            other => source.push_str(&regex::escape(&other.to_string())),
        }
        index += 1;
    }

    source.push('$');
    Regex::new(&source)
}

pub fn matches_file_glob(pattern: &str, file_path: &str) -> bool {
    let normalized_path = file_path.replace('\\', "/");
    if glob_to_regex(pattern).is_ok_and(|regex| regex.is_match(&normalized_path)) {
        return true;
    }

    if !pattern.contains('*') && !pattern.contains('?') {
        return normalized_path
            .rsplit('/')
            .next()
            .is_some_and(|basename| basename == pattern);
    }

    false
}

fn matches_any_keyword(prompt: &str, keywords: &[String]) -> bool {
    let normalized_prompt = prompt.to_lowercase();
    keywords.iter().any(|keyword| {
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
        Regex::new(&pattern).is_ok_and(|regex| regex.is_match(&normalized_prompt))
    })
}

fn matches_any_pattern(prompt: &str, patterns: &[String]) -> bool {
    patterns.iter().any(|pattern| {
        RegexBuilder::new(pattern)
            .case_insensitive(true)
            .build()
            .is_ok_and(|regex| regex.is_match(prompt))
    })
}

fn matches_language(request_language: Option<&str>, languages: &[String]) -> bool {
    let Some(request_language) = request_language else {
        return false;
    };
    let normalized = request_language.to_lowercase();
    languages
        .iter()
        .any(|language| language.to_lowercase() == normalized)
}

fn matches_file(request: &RouteRequest, patterns: &[String]) -> bool {
    let Some(files) = &request.files else {
        return false;
    };
    files.iter().any(|file| {
        patterns
            .iter()
            .any(|pattern| matches_file_glob(pattern, file))
    })
}

fn prompt_length(prompt: &str) -> usize {
    prompt.encode_utf16().count()
}

fn matches_when(request: &RouteRequest, when: &RuleWhen) -> bool {
    if let Some(keywords) = &when.keywords
        && !matches_any_keyword(&request.prompt, keywords)
    {
        return false;
    }

    if let Some(patterns) = &when.patterns
        && !matches_any_pattern(&request.prompt, patterns)
    {
        return false;
    }

    if let Some(languages) = &when.languages
        && !matches_language(request.language.as_deref(), languages)
    {
        return false;
    }

    if let Some(files) = &when.files
        && !matches_file(request, files)
    {
        return false;
    }

    let length = prompt_length(&request.prompt);
    if when
        .min_prompt_length
        .is_some_and(|minimum| length < minimum as usize)
    {
        return false;
    }
    if when
        .max_prompt_length
        .is_some_and(|maximum| length > maximum as usize)
    {
        return false;
    }

    true
}

/// Test all conditions in a rule; conditions are combined with AND.
pub fn matches_rule(request: &RouteRequest, rule: &RouteRule) -> bool {
    rule.when
        .as_ref()
        .is_none_or(|when| matches_when(request, when))
}

pub fn rule_matches_candidate(rule: &RouteRule, candidate: &RouteCandidate) -> bool {
    if rule
        .r#use
        .agent
        .is_some_and(|agent| agent != candidate.agent)
    {
        return false;
    }

    if let Some(model) = &rule.r#use.model
        && candidate.model.as_deref() != Some(model.as_str())
    {
        return false;
    }

    true
}

fn describe_rule(rule: &RouteRule) -> String {
    let target = [
        rule.r#use.agent.map(|agent| agent.to_string()),
        rule.r#use.model.clone(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(":");

    if target.is_empty() {
        format!("matched rule \"{}\"", rule.name)
    } else {
        format!("matched rule \"{}\" -> {target}", rule.name)
    }
}

/// Return matching rules ordered by descending priority, then source order.
pub fn match_rules(request: &RouteRequest, rules: &[RouteRule]) -> Vec<RuleMatch> {
    let mut matched: Vec<(usize, &RouteRule)> = rules
        .iter()
        .enumerate()
        .filter(|(_, rule)| matches_rule(request, rule))
        .collect();

    matched.sort_by(|(left_index, left), (right_index, right)| {
        right
            .priority
            .cmp(&left.priority)
            .then_with(|| left_index.cmp(right_index))
    });

    matched
        .into_iter()
        .map(|(_, rule)| RuleMatch {
            rule: rule.clone(),
            reason: describe_rule(rule),
        })
        .collect()
}

pub fn match_rules_for_candidate(
    request: &RouteRequest,
    candidate: &RouteCandidate,
    rules: &[RouteRule],
) -> Vec<RuleMatch> {
    match_rules(request, rules)
        .into_iter()
        .filter(|matched| rule_matches_candidate(&matched.rule, candidate))
        .collect()
}
