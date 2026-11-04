use coderelay_core::AgentId;
use coderelay_core::session::{
    SessionTurn, TurnContextSource, TurnProtocol, TurnRunStatus, build_prompt_with_context,
};

fn turn(index: i64, cli_id: AgentId, prompt: &str, output: &str) -> SessionTurn {
    SessionTurn {
        id: index,
        session_id: "session-1".to_owned(),
        cli_id,
        prompt: prompt.to_owned(),
        output: output.to_owned(),
        exit_code: Some(0),
        signal: None,
        duration_ms: 100,
        created_at: 1_700_000_000_000,
        model_id: Some("model-fixture".to_owned()),
        protocol: Some(TurnProtocol::Text),
        reused_native: Some(false),
        status: Some(TurnRunStatus::Completed),
        event_summary: Some("non-empty summary".to_owned()),
        context_source: Some(TurnContextSource::Transcript),
    }
}

#[test]
fn no_history_returns_prompt_untouched() {
    assert_eq!(build_prompt_with_context(&[], "do work"), "do work");
}

#[test]
fn history_is_replayed_for_a_different_cli() {
    let history = vec![
        turn(1, AgentId::Codex, "先做 A", "A 完成"),
        turn(2, AgentId::Claude, "再做 B", "B 完成"),
    ];
    let prompt = build_prompt_with_context(&history, "继续做 C");

    assert!(prompt.contains("协作记录"));
    assert!(prompt.contains("[#1] 用户:"));
    assert!(prompt.contains("先做 A"));
    assert!(prompt.contains("[#2] claude 输出:"));
    assert!(prompt.contains("B 完成"));
    assert!(prompt.ends_with("用户新请求：\n继续做 C"));
}

#[test]
fn oversized_output_keeps_the_tail() {
    let output = "x".repeat(4_000);
    let prompt = build_prompt_with_context(&[turn(1, AgentId::Codex, "继续", &output)], "next");
    assert!(prompt.contains('…'));
    assert!(prompt.contains(&"x".repeat(1_500)));
    assert!(!prompt.contains(&"x".repeat(1_600)));
}

#[test]
fn oldest_turns_are_dropped_at_the_total_budget() {
    let history: Vec<_> = (0..10)
        .map(|index| {
            turn(
                index + 1,
                AgentId::Codex,
                &format!("第 {} 问", index + 1),
                &"z".repeat(1_500),
            )
        })
        .collect();
    let prompt = build_prompt_with_context(&history, "继续");

    assert!(!prompt.contains("第 1 问"));
    assert!(!prompt.contains("第 4 问"));
    assert!(prompt.contains("第 6 问"));
    assert!(prompt.contains("第 10 问"));
}
