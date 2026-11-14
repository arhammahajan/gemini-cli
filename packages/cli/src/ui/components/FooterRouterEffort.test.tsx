/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Config,
  loadModelRouterCatalog,
  uiTelemetryService,
} from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { waitFor } from '../../test-utils/async.js';
import { Footer } from './Footer.js';

describe('router effort in the footer', () => {
  let config: Config;
  const sessionStats = {
    sessionId: 'footer-test',
    sessionStartTime: new Date(),
    metrics: uiTelemetryService.getMetrics(),
    lastPromptTokenCount: 0,
    promptCount: 0,
  };
  const settings = () =>
    createMockSettings({
      ui: { footer: { items: ['model-name'], showLabels: false } },
    });

  beforeEach(async () => {
    vi.stubEnv('GEMINI_MODEL_ROUTER', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: ['router-chat', 'router-response'].map((id) => ({
              id,
              metadata: {
                router: {
                  reasoning: {
                    effort: { values: { value: ['high', 'max'] } },
                  },
                },
              },
            })),
          }),
        ),
      ),
    );
    await loadModelRouterCatalog();
    config = new Config({
      sessionId: 'footer-effort-test',
      targetDir: process.cwd(),
      cwd: process.cwd(),
      model: 'router-chat',
      debugMode: false,
      modelConfigServiceConfig: {
        aliases: { 'chat-base': { modelConfig: {} } },
      },
    });
  });

  afterEach(async () => {
    vi.stubEnv('GEMINI_MODEL_ROUTER', '');
    await loadModelRouterCatalog();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('appends auto or the selected effort and refreshes on render', async () => {
    const { lastFrame, rerender, waitUntilReady } = await renderWithProviders(
      <Footer />,
      {
        config,
        settings: settings(),
        uiState: { currentModel: 'router-chat', sessionStats },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('router-chat [auto]');
    config.setModelRouterEffort('max');
    rerender(<Footer />);
    await waitFor(() => expect(lastFrame()).toContain('router-chat [max]'));
    config.setModelRouterEffort('auto');
    rerender(<Footer />);
    await waitFor(() => expect(lastFrame()).toContain('router-chat [auto]'));
  });

  it("uses the displayed model's saved effort instead of another model's value", async () => {
    config.setModelRouterEffort('max');
    config.setModel('router-response');
    config.setModelRouterEffort('high');
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <Footer />,
      {
        config,
        settings: settings(),
        uiState: { currentModel: 'router-chat', sessionStats },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('router-chat [max]');
    expect(lastFrame()).not.toContain('[high]');
  });

  it('keeps normal Gemini model labels unchanged outside the router catalog', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <Footer />,
      {
        config,
        settings: settings(),
        uiState: { currentModel: 'gemini-2.5-pro', sessionStats },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('gemini-2.5-pro');
    expect(lastFrame()).not.toContain('[auto]');
    expect(lastFrame()).not.toContain('[high]');
    expect(lastFrame()).not.toContain('[max]');
  });
});
