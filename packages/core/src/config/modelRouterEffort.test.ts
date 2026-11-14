/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Config } from './config.js';
import { loadModelRouterCatalog } from './modelRouterCatalog.js';

describe('model router effort in Config', () => {
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
      sessionId: 'router-effort-test',
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

  const resolvedHeaders = (config: Config) =>
    config
      .getModelConfigService()
      .getResolvedConfig({ model: config.getModel(), isChatModel: true })
      .generateContentConfig.httpOptions?.headers;

  it('remembers exact efforts independently when models change through Config', () => {
    expect(config.getModelRouterEffort()).toBe('auto');
    config.setModelRouterEffort('max');
    expect(resolvedHeaders(config)).toEqual({
      'x-model-router-reasoning-effort': 'max',
    });
    config.setModel('response');
    expect(config.getModelRouterEffort()).toBe('auto');
    expect(resolvedHeaders(config)).toBeUndefined();
    config.setModelRouterEffort('xhigh');
    expect(config.getModelRouterEffort('chat')).toBe('max');
    expect(resolvedHeaders(config)).toEqual({
      'x-model-router-reasoning-effort': 'xhigh',
    });
    config.setModel('chat');
    expect(config.getModelRouterEffort()).toBe('max');
    expect(resolvedHeaders(config)).toEqual({
      'x-model-router-reasoning-effort': 'max',
    });
    config.setModelRouterEffort('auto');
    expect(resolvedHeaders(config)).toBeUndefined();
  });

  it('rejects unsupported values without changing the selected effort', () => {
    config.setModelRouterEffort('high');
    expect(() => config.setModelRouterEffort('medium')).toThrow(
      'Supported efforts: auto, low, high, max',
    );
    expect(config.getModelRouterEffort()).toBe('high');
    expect(resolvedHeaders(config)).toEqual({
      'x-model-router-reasoning-effort': 'high',
    });
  });

  it('accepts only auto when effort facts are unknown and rejects non-router models', () => {
    config.setModel('unknown');
    expect(() => config.setModelRouterEffort('low')).toThrow(
      'Supported efforts: auto.',
    );
    config.setModelRouterEffort('auto');
    expect(resolvedHeaders(config)).toBeUndefined();
    config.setModel('gemini-2.5-pro');
    expect(() => config.setModelRouterEffort('high')).toThrow(
      'not in the model router catalog',
    );
  });
});
