use crate::agent::AgentId;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PromptBuildOptions {
    pub prompt: String,
    pub model: Option<String>,
    pub extra_args: Vec<String>,
    pub native_session_id: Option<String>,
}

/// Build argv after the executable name for one prompt run.
pub fn build_prompt_args(agent: AgentId, options: &PromptBuildOptions) -> Vec<String> {
    let model_args: Vec<String> = options
        .model
        .as_ref()
        .filter(|model| !model.is_empty())
        .map(|model| vec!["--model".to_owned(), model.clone()])
        .unwrap_or_default();
    let mut args = Vec::new();

    match agent {
        AgentId::Codex => {
            args.push("exec".to_owned());
            args.extend(model_args);
            args.extend(options.extra_args.clone());
            if let Some(session_id) = &options.native_session_id {
                args.push("resume".to_owned());
                args.push(session_id.clone());
            }
            args.push(options.prompt.clone());
        }
        AgentId::Claude => {
            args.push("-p".to_owned());
            args.extend(model_args);
            args.extend(options.extra_args.clone());
            if let Some(session_id) = &options.native_session_id {
                args.push("--resume".to_owned());
                args.push(session_id.clone());
            }
            args.push(options.prompt.clone());
        }
        AgentId::Pi => {
            args.push("-p".to_owned());
            args.extend(model_args);
            args.extend(options.extra_args.clone());
            if let Some(session_id) = &options.native_session_id {
                args.push("--session".to_owned());
                args.push(session_id.clone());
            }
            args.push(options.prompt.clone());
        }
        AgentId::Omp => {
            args.push("-p".to_owned());
            args.push("--mode".to_owned());
            args.push("json".to_owned());
            args.extend(model_args);
            args.extend(options.extra_args.clone());
            if let Some(session_id) = &options.native_session_id {
                args.push("--resume".to_owned());
                args.push(session_id.clone());
            }
            args.push(options.prompt.clone());
        }
    }

    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_uses_exec_and_resume_before_prompt() {
        let args = build_prompt_args(
            AgentId::Codex,
            &PromptBuildOptions {
                prompt: "fix tests".to_owned(),
                model: Some("gpt-5".to_owned()),
                extra_args: vec!["--verbose".to_owned()],
                native_session_id: Some("session-1".to_owned()),
            },
        );
        assert_eq!(
            args,
            vec![
                "exec",
                "--model",
                "gpt-5",
                "--verbose",
                "resume",
                "session-1",
                "fix tests"
            ]
        );
    }

    #[test]
    fn omp_enables_json_mode_with_non_empty_model_metadata() {
        let args = build_prompt_args(
            AgentId::Omp,
            &PromptBuildOptions {
                prompt: "plan".to_owned(),
                model: Some("openai/gpt-5".to_owned()),
                extra_args: vec![],
                native_session_id: None,
            },
        );
        assert_eq!(
            args,
            vec!["-p", "--mode", "json", "--model", "openai/gpt-5", "plan"]
        );
    }
}
