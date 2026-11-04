use std::collections::BTreeMap;
use std::path::Path;
use std::time::Duration;

use coderelay_core::router::jev::{
    JevClient, JevDecision, JevError, JevResponseBody, TYPESAFE_DEFAULT_ENDPOINT,
    TYPESAFE_DEFAULT_MODEL, TYPESAFE_ENV_KEY, build_jev_request, format_candidate_key,
};
use coderelay_core::{Config, RouteCandidate, RouteRequest};

const CANDIDATE_ENV_FILES: [&str; 3] = [".env.local", "env.local", ".env"];

pub struct JevHttpClient {
    client: reqwest::Client,
    endpoint: String,
    api_key: String,
    timeout_ms: u64,
}

impl JevHttpClient {
    pub async fn from_config(
        config: &Config,
        cwd: &Path,
        environment: &BTreeMap<String, String>,
    ) -> Result<Self, JevError> {
        Self::from_config_with_stored_key(config, cwd, environment, None).await
    }

    pub async fn from_config_with_stored_key(
        config: &Config,
        cwd: &Path,
        environment: &BTreeMap<String, String>,
        stored_api_key: Option<&str>,
    ) -> Result<Self, JevError> {
        let api_key = resolve_api_key(
            config.routing.typesafe_api_key.as_deref(),
            stored_api_key,
            cwd,
            environment,
        )
        .await?;
        let endpoint = config
            .routing
            .typesafe_endpoint
            .clone()
            .unwrap_or_else(|| TYPESAFE_DEFAULT_ENDPOINT.to_owned());
        let timeout_ms = 5_000;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(timeout_ms))
            .build()
            .map_err(|error| JevError::InvalidResponse(error.to_string()))?;
        Ok(Self {
            client,
            endpoint,
            api_key,
            timeout_ms,
        })
    }
}

impl JevClient for JevHttpClient {
    async fn decide(
        &self,
        request: &RouteRequest,
        candidates: &[RouteCandidate],
    ) -> Result<JevDecision, JevError> {
        if candidates.is_empty() {
            return Err(JevError::NoCandidates);
        }

        let payload = build_jev_request(request, candidates, TYPESAFE_DEFAULT_MODEL);
        let response = self
            .client
            .post(&self.endpoint)
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    JevError::Timeout {
                        timeout_ms: self.timeout_ms,
                    }
                } else {
                    JevError::Http {
                        status: 0,
                        message: error.to_string(),
                    }
                }
            })?;

        let status = response.status();
        if !status.is_success() {
            let message = response.text().await.unwrap_or_default();
            return Err(JevError::Http {
                status: status.as_u16(),
                message,
            });
        }

        let body: JevResponseBody = response
            .json()
            .await
            .map_err(|error| JevError::InvalidResponse(error.to_string()))?;
        let answer = body
            .answers
            .get("decision")
            .and_then(Option::as_ref)
            .ok_or(JevError::NoChoice)?;
        let candidate = candidates
            .iter()
            .find(|candidate| format_candidate_key(candidate) == answer.choice)
            .cloned()
            .ok_or_else(|| JevError::InvalidChoice {
                choice: answer.choice.clone(),
            })?;

        Ok(JevDecision {
            agent: candidate.agent,
            model: candidate.model.clone(),
            candidate,
            confidence: answer.confidence,
            probabilities: answer.probabilities.clone(),
            raw_choice: answer.choice.clone(),
            model_name: body.model,
            usage: body.usage,
        })
    }
}

pub async fn resolve_api_key(
    explicit: Option<&str>,
    stored: Option<&str>,
    cwd: &Path,
    environment: &BTreeMap<String, String>,
) -> Result<String, JevError> {
    if let Some(value) = stored.map(str::trim).filter(|value| !value.is_empty()) {
        return Ok(value.to_owned());
    }
    if let Some(value) = explicit.map(str::trim).filter(|value| !value.is_empty()) {
        return Ok(value.to_owned());
    }
    if let Some(value) = environment
        .get(TYPESAFE_ENV_KEY)
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(value.to_owned());
    }

    for file_name in CANDIDATE_ENV_FILES {
        let file = cwd.join(file_name);
        let Ok(text) = tokio::fs::read_to_string(file).await else {
            continue;
        };
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            let Some((key, value)) = trimmed.split_once('=') else {
                continue;
            };
            if key.trim() == TYPESAFE_ENV_KEY {
                let value = value.trim().trim_matches(['"', '\'']);
                if !value.is_empty() {
                    return Ok(value.to_owned());
                }
            }
        }
    }

    Err(JevError::NoKey)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stored_api_key_takes_priority_over_other_sources() {
        let dir = tempfile::tempdir().expect("temp dir");
        let environment = BTreeMap::from([(TYPESAFE_ENV_KEY.to_owned(), "env-key".to_owned())]);

        assert_eq!(
            resolve_api_key(
                Some("config-key"),
                Some("  sqlite-key  "),
                dir.path(),
                &environment,
            )
            .await
            .expect("stored key"),
            "sqlite-key"
        );
        assert_eq!(
            resolve_api_key(Some("config-key"), None, dir.path(), &environment)
                .await
                .expect("config fallback"),
            "config-key"
        );
        assert_eq!(
            resolve_api_key(None, None, dir.path(), &environment)
                .await
                .expect("environment fallback"),
            "env-key"
        );
    }
}
