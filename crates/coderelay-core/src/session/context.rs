use crate::session::types::SessionTurn;

const MAX_TURN_OUTPUT_CHARS: usize = 1_500;
const MAX_TOTAL_CONTEXT_CHARS: usize = 8_000;

fn tail_chars(value: &str, count: usize) -> String {
    let length = value.chars().count();
    if length > count {
        value.chars().skip(length - count).collect()
    } else {
        value.to_owned()
    }
}

/// Build a transcript that lets any CLI continue another CLI's prior work.
pub fn build_prompt_with_context(turns: &[SessionTurn], prompt: &str) -> String {
    if turns.is_empty() {
        return prompt.to_owned();
    }

    let mut blocks: Vec<String> = Vec::new();
    let mut total = 0;

    for (index, turn) in turns.iter().enumerate().rev() {
        let output = tail_chars(&turn.output, MAX_TURN_OUTPUT_CHARS);
        let output = if turn.output.chars().count() > MAX_TURN_OUTPUT_CHARS {
            format!("…{output}")
        } else {
            output
        };
        let output = if output.is_empty() {
            "（无文本输出）".to_owned()
        } else {
            output
        };
        let ordinal = index + 1;
        let block = format!(
            "[#{ordinal}] 用户:\n{}\n[#{ordinal}] {} 输出:\n{}",
            turn.prompt, turn.cli_id, output
        );
        let block_length = block.chars().count();
        if total + block_length > MAX_TOTAL_CONTEXT_CHARS {
            break;
        }
        blocks.insert(0, block);
        total += block_length;
    }

    if blocks.is_empty() {
        return prompt.to_owned();
    }

    [
        "以下是本轮任务此前的协作记录（可能由其他 agent 完成），请在此基础上继续：",
        "<context>",
        &blocks.join("\n"),
        "</context>",
        "",
        "用户新请求：",
        prompt,
    ]
    .join("\n")
}
