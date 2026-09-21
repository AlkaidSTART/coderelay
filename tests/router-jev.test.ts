import { describe, expect, test } from "bun:test";

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

  test("reads key from local env file in workspace", async () => {
    const key = await resolveTypesafeApiKey({ cwd: process.cwd() });
    expect(key).toBeDefined();
    expect(key).toStartWith("apikey_");
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
    expect(req.questions.decision?.type).toBe("choice");

    const criteria = req.questions.decision.criteria;
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
    const mockFetch: typeof fetch = async (url, init) => {
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
    const mockFetch: typeof fetch = async () =>
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
        strengths: ["reasoning", "architecture"],
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
