import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RouteCandidate } from "../src/router/types";
import {
  buildJevRequest,
  formatCandidateKey,
  jevDecisionToRouteDecision,
  JevError,
  resolveTypesafeApiKey,
  routeWithJev,
  TYPESAFE_DEFAULT_ENDPOINT,
} from "../src/router/jev";

describe("formatCandidateKey", () => {
  test("formats bare agent without model", () => {
    const candidate: RouteCandidate = {
      agent: "claude",
      strengths: ["reasoning"],
      isDefault: false,
    };
    expect(formatCandidateKey(candidate)).toBe("claude");
  });

  test("formats agent with model", () => {
    const candidate: RouteCandidate = {
      agent: "codex",
      model: "o3-mini",
      strengths: ["coding"],
      isDefault: true,
    };
    expect(formatCandidateKey(candidate)).toBe("codex:o3-mini");
  });
});

describe("resolveTypesafeApiKey", () => {
  test("prefers explicitly supplied key", async () => {
    const key = await resolveTypesafeApiKey({
      explicitKey: "explicit_key_123",
      cwd: "/non-existent",
    });
    expect(key).toBe("explicit_key_123");
  });

  test("reads key from local env file in directory", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "coderelay-env-test-"));
    try {
      await writeFile(
        join(tmpDir, "env.locaj"),
        "TYPESAFE_API_KEY=apikey_mock_12345\n",
      );
      const key = await resolveTypesafeApiKey({ cwd: tmpDir });
      expect(key).toBe("apikey_mock_12345");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("returns null when no key is configured", async () => {
    const original = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    const tmpDir = await mkdtemp(join(tmpdir(), "coderelay-env-test-"));
    try {
      const key = await resolveTypesafeApiKey({ cwd: tmpDir });
      expect(key).toBeNull();
    } finally {
      if (original) {
        process.env.TYPESAFE_API_KEY = original;
      }
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("buildJevRequest", () => {
  const candidates: RouteCandidate[] = [
    {
      agent: "claude",
      label: "Claude Code",
      strengths: ["reasoning", "coding"],
      isDefault: true,
    },
    {
      agent: "codex",
      model: "o3-mini",
      label: "Codex Fast",
      strengths: ["fast"],
      isDefault: false,
    },
  ];

  test("builds typed choice question with candidate criteria", () => {
    const req = buildJevRequest("Fix bug in backend", candidates);
    expect(req.state).toBe("Fix bug in backend");
    expect(req.model).toBe("jev-latest");
    const question = req.questions["decision"];
    expect(question?.type).toBe("choice");

    const criteria = question!.criteria;
    expect(criteria["claude"]).toContain("Claude Code");
    expect(criteria["claude"]).toContain("strengths: reasoning, coding");
    expect(criteria["claude"]).toContain("default agent");
    expect(criteria["codex:o3-mini"]).toContain("Codex Fast");
  });
});

describe("routeWithJev", () => {
  const candidates: RouteCandidate[] = [
    {
      agent: "claude",
      label: "Claude Code",
      strengths: ["reasoning"],
      isDefault: true,
    },
    {
      agent: "codex",
      label: "Codex",
      strengths: ["coding"],
      isDefault: false,
    },
  ];

  test("throws JevError when candidates list is empty", async () => {
    expect(
      routeWithJev({ prompt: "hello" }, [], { apiKey: "test" }),
    ).rejects.toThrow(JevError);
  });

  test("throws JevError when no apiKey is available", async () => {
    const originalEnv = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      await expect(
        routeWithJev({ prompt: "hello" }, candidates, {
          apiKey: undefined,
          cwd: "/empty-non-existent-dir",
        }),
      ).rejects.toThrow(JevError);
    } finally {
      if (originalEnv) {
        process.env.TYPESAFE_API_KEY = originalEnv;
      }
    }
  });

  test("routes successfully with mocked fetch", async () => {
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe(TYPESAFE_DEFAULT_ENDPOINT);
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test_key");

      const resBody = {
        model: "jev-1.13.0",
        answers: {
          decision: {
            type: "choice",
            choice: "claude",
            confidence: 0.88,
            probabilities: {
              claude: 0.88,
              codex: 0.12,
            },
          },
        },
        usage: {
          input_tokens: 310,
          output_tokens: 28,
        },
      };

      return new Response(JSON.stringify(resBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const decision = await routeWithJev(
      { prompt: "Refactor architecture" },
      candidates,
      {
        apiKey: "test_key",
        fetchFn: mockFetch,
      },
    );

    expect(decision.agent).toBe("claude");
    expect(decision.confidence).toBe(0.88);
    expect(decision.modelName).toBe("jev-1.13.0");
    expect(decision.usage?.inputTokens).toBe(310);
  });

  test("handles HTTP 401 Unauthorized from API", async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    await expect(
      routeWithJev({ prompt: "Refactor" }, candidates, {
        apiKey: "bad_key",
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(JevError);
  });

  test("throws JevError with INVALID_CHOICE when choice matches no candidate", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            decision: {
              type: "choice",
              choice: "unknown-agent:unknown-model",
              confidence: 0.9,
              probabilities: { "unknown-agent:unknown-model": 0.9 },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const error = await routeWithJev({ prompt: "Refactor" }, candidates, {
      apiKey: "test_key",
      fetchFn: mockFetch,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).code).toBe("INVALID_CHOICE");
  });

  test("does not fall back to agent name when the model is unknown", async () => {
    const modeledCandidates: RouteCandidate[] = [
      {
        agent: "codex",
        model: "gpt-5.6",
        strengths: ["coding"],
        isDefault: true,
      },
      {
        agent: "codex",
        model: "o3-mini",
        strengths: ["fast"],
        isDefault: false,
      },
    ];

    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            decision: {
              type: "choice",
              choice: "codex:unknown-model",
              confidence: 0.9,
              probabilities: { "codex:unknown-model": 0.9 },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const error = await routeWithJev({ prompt: "Refactor" }, modeledCandidates, {
      apiKey: "test_key",
      fetchFn: mockFetch,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).code).toBe("INVALID_CHOICE");
  });

  test("selects the exact model when several candidates share an agent", async () => {
    const modeledCandidates: RouteCandidate[] = [
      {
        agent: "codex",
        model: "gpt-5.6",
        strengths: ["coding"],
        isDefault: true,
      },
      {
        agent: "codex",
        model: "o3-mini",
        strengths: ["fast"],
        isDefault: false,
      },
    ];

    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            decision: {
              type: "choice",
              choice: "codex:o3-mini",
              confidence: 0.7,
              probabilities: { "codex:o3-mini": 0.7 },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const decision = await routeWithJev(
      { prompt: "Refactor" },
      modeledCandidates,
      { apiKey: "test_key", fetchFn: mockFetch },
    );

    expect(decision.agent).toBe("codex");
    expect(decision.model).toBe("o3-mini");
    expect(decision.rawChoice).toBe("codex:o3-mini");
  });
});

describe("jevDecisionToRouteDecision", () => {
  test("maps JevDecision to RouteDecision structure", () => {
    const candidate: RouteCandidate = {
      agent: "claude",
      strengths: [],
      isDefault: true,
    };
    const routeDec = jevDecisionToRouteDecision({
      agent: "claude",
      candidate,
      confidence: 0.92,
      probabilities: { claude: 0.92 },
      rawChoice: "claude",
      modelName: "jev-1.13.0",
    });

    expect(routeDec.agent).toBe("claude");
    expect(routeDec.strategy).toBe("jev");
    expect(routeDec.score).toBe(0.92);
    expect(routeDec.reasons[0]).toContain("92% confidence");
  });
});

describe("real TypeSafe API integration", () => {
  test("successfully executes actual Jev decision when key is present", async () => {
    const apiKey = await resolveTypesafeApiKey({ cwd: process.cwd() });
    if (!apiKey) {
      return;
    }

    const candidates: RouteCandidate[] = [
      {
        agent: "claude",
        label: "Claude Code",
        strengths: ["reasoning", "coding"],
        isDefault: true,
      },
      {
        agent: "codex",
        label: "Codex",
        strengths: ["coding", "fast"],
        isDefault: false,
      },
    ];

    const decision = await routeWithJev(
      { prompt: "Write unit tests for authentication middleware in TypeScript" },
      candidates,
      { apiKey, timeoutMs: 10000 },
    );

    expect(decision.agent).toBeDefined();
    expect(["claude", "codex"]).toContain(decision.agent);
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.modelName).toStartWith("jev");
  });
});
