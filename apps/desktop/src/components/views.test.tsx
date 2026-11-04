import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ApiKeyView } from "./ApiKeyView";
import { ConfigView } from "./ConfigView";
import { IconRail } from "./IconRail";
import type { JevSettings, WorkspaceView } from "../types";

describe("Decoupled ApiKeyView & ConfigView", () => {
  it("renders ApiKeyView with stored SQLite key and ensures no config yaml elements exist", () => {
    const jevSettings: JevSettings = {
      stored: true,
      environmentConfigured: false,
    };
    const html = renderToStaticMarkup(
      <ApiKeyView
        jevBusy={false}
        jevSettings={jevSettings}
        jevApiKeyInput="sk-live-real-user-test-key-12345"
        notice="API Key 已成功持久化到本地 SQLite"
        onJevApiKeyInputChange={() => {}}
        onSaveJevApiKey={() => {}}
        onClearJevApiKey={() => {}}
      />,
    );

    // Verify API Key management UI elements
    expect(html).toContain("API 密钥管理");
    expect(html).toContain("TypeSafe JEV 决策路由");
    expect(html).toContain("已存储在本地安全数据库 (SQLite)");
    expect(html).toContain("API Key 已成功持久化到本地 SQLite");
    expect(html).toContain("sk-live-real-user-test-key-12345");
    expect(html).toContain("清除已存 API Key");

    // Strictly ensure Decoupling: Config YAML elements must NOT exist in ApiKeyView
    expect(html).not.toContain("Config YAML");
    expect(html).not.toContain("textarea");
    expect(html).not.toContain("config.yaml");
  });

  it("renders ApiKeyView with environment-configured key state and unconfigured state", () => {
    const envSettings: JevSettings = {
      stored: false,
      environmentConfigured: true,
    };
    const envHtml = renderToStaticMarkup(
      <ApiKeyView
        jevBusy={false}
        jevSettings={envSettings}
        jevApiKeyInput=""
        onJevApiKeyInputChange={() => {}}
        onSaveJevApiKey={() => {}}
        onClearJevApiKey={() => {}}
      />,
    );

    expect(envHtml).toContain("已从环境变量 (TYPESAFE_API_KEY) 配置");
    expect(envHtml).not.toContain("清除已存 API Key");

    const unconfiguredSettings: JevSettings = {
      stored: false,
      environmentConfigured: false,
    };
    const unconfHtml = renderToStaticMarkup(
      <ApiKeyView
        jevBusy={false}
        jevSettings={unconfiguredSettings}
        jevApiKeyInput=""
        onJevApiKeyInputChange={() => {}}
        onSaveJevApiKey={() => {}}
        onClearJevApiKey={() => {}}
      />,
    );

    expect(unconfHtml).toContain("未配置");
    expect(unconfHtml).toContain("填入 TYPESAFE_API_KEY");
  });

  it("renders ConfigView focused solely on config YAML settings without any API key coupling", () => {
    const sampleConfigPath = "/home/developer/.coderelay/config.yaml";
    const sampleConfigDraft = [
      "routing:",
      "  mode: dynamic",
      "  fallbackAgent: claude",
      "  timeoutMs: 30000",
    ].join("\n");

    const html = renderToStaticMarkup(
      <ConfigView
        configPath={sampleConfigPath}
        configBusy={false}
        configDraft={sampleConfigDraft}
        onConfigDraftChange={() => {}}
        onLoadConfigSource={() => {}}
        onSaveConfig={() => {}}
      />,
    );

    // Verify Config UI elements
    expect(html).toContain(sampleConfigPath);
    expect(html).toContain("Config YAML");
    expect(html).toContain("fallbackAgent: claude");

    // Verify Theme Preset options including newly added themes
    expect(html).toContain("主题外观");
    expect(html).toContain("青色");
    expect(html).toContain("天蓝色");
    expect(html).toContain("粉色");
    expect(html).toContain("红色");
    expect(html).toContain("自定义背景图");
    expect(html).toContain("上传背景图片文件");

    // Strictly ensure Decoupling: API Key elements must NOT be coupled into ConfigView
    expect(html).not.toContain("API Key");
    expect(html).not.toContain("jev-api-key");
    expect(html).not.toContain("TYPESAFE_API_KEY");
    expect(html).not.toContain("API 密钥管理");
  });

  it("renders IconRail with distinct navigation destinations for both API Keys and Settings", () => {
    let selectedView: WorkspaceView | null = null;
    const handleSelectView = (view: WorkspaceView) => {
      selectedView = view;
    };

    // When viewing apikeys
    const apiKeyRailHtml = renderToStaticMarkup(
      <IconRail
        currentView="apikeys"
        onSelectView={handleSelectView}
        onStartNewTask={() => {}}
      />,
    );

    expect(apiKeyRailHtml).toContain('aria-label="API Keys"');
    expect(apiKeyRailHtml).toContain('aria-label="Settings"');

    // When viewing config
    const configRailHtml = renderToStaticMarkup(
      <IconRail
        currentView="config"
        onSelectView={handleSelectView}
        onStartNewTask={() => {}}
      />,
    );

    expect(configRailHtml).toContain('aria-label="API Keys"');
    expect(configRailHtml).toContain('aria-label="Settings"');
  });
});
