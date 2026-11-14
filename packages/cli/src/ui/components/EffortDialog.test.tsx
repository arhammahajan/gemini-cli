/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Config, loadModelRouterCatalog } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { EffortDialog } from './EffortDialog.js';

describe('EffortDialog', () => {
  let config: Config;

  beforeEach(async () => {
    vi.stubEnv('GEMINI_MODEL_ROUTER', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'chat',
                metadata: {
                  display_name: 'Chat Model',
                  router: {
                    reasoning: {
                      effort: { values: { value: ['low', 'high', 'max'] } },
                    },
                  },
                },
              },
              {
                id: 'response',
                metadata: {
                  router: {
                    reasoning: {
                      effort: {
                        values: { value: ['none', 'medium', 'xhigh'] },
                      },
                    },
                  },
                },
              },
              { id: 'unknown' },
            ],
          }),
        ),
      ),
    );
    await loadModelRouterCatalog();
    config = new Config({
      sessionId: 'effort-dialog-test',
      targetDir: process.cwd(),
      cwd: process.cwd(),
      model: 'chat',
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

  it("lists only the current model's exact levels and upstream default", async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <EffortDialog config={config} onClose={vi.fn()} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Chat Model');
    expect(lastFrame()).toContain('Upstream default (auto)');
    for (const level of ['low', 'high', 'max'])
      expect(lastFrame()).toContain(level);
    for (const level of ['medium', 'xhigh'])
      expect(lastFrame()).not.toContain(level);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('starts on the current effort so Enter preserves it', async () => {
    config.setModelRouterEffort('high');
    const onClose = vi.fn();
    const { stdin, waitUntilReady, lastFrame } = await renderWithProviders(
      <EffortDialog config={config} onClose={onClose} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('high (current)');
    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(config.getModelRouterEffort()).toBe('high');
  });

  it('applies a keyboard selection and closes the picker', async () => {
    const onClose = vi.fn();
    const { stdin, waitUntilReady } = await renderWithProviders(
      <EffortDialog config={config} onClose={onClose} />,
    );
    await waitUntilReady();
    for (let index = 0; index < 3; index++) {
      await act(async () => {
        stdin.write('\u001b[B');
      });
    }
    expect(config.getModelRouterEffort()).toBe('auto');
    await act(async () => {
      stdin.write('\r');
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(config.getModelRouterEffort()).toBe('max');
  });

  it('cancels with Escape without applying the highlighted value', async () => {
    config.setModelRouterEffort('high');
    const onClose = vi.fn();
    const { stdin, waitUntilReady } = await renderWithProviders(
      <EffortDialog config={config} onClose={onClose} />,
    );
    await waitUntilReady();
    await act(async () => {
      stdin.write('\u001b[B');
    });
    await act(async () => {
      stdin.write('\u001b');
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(config.getModelRouterEffort()).toBe('high');
  });

  it('offers only upstream default when no levels are published', async () => {
    config.setModel('unknown');
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <EffortDialog config={config} onClose={vi.fn()} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('No effort levels are published');
    expect(lastFrame()).toContain('Upstream default (auto)');
    for (const level of ['low', 'high', 'max'])
      expect(lastFrame()).not.toContain(level);
  });

  it("uses the new model's vocabulary when reopened after a model switch", async () => {
    config.setModel('response');
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <EffortDialog config={config} onClose={vi.fn()} />,
    );
    await waitUntilReady();
    for (const level of ['none', 'medium', 'xhigh'])
      expect(lastFrame()).toContain(level);
    expect(lastFrame()).not.toContain('max');
    expect(lastFrame()).not.toContain('low');
  });
});
