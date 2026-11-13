/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Config,
  ModelConfigService,
  loadModelRouterCatalog,
} from '@google/gemini-cli-core';
import {
  ModelRouterSessionConfig,
  routerAvailableModels,
} from './modelRouterConfig.js';

describe('router ACP configuration', () => {
  let current: string;
  let service: ModelConfigService;
  let session: ModelRouterSessionConfig;

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
                    limits: { context_window: { value: 500000 } },
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
                    limits: { context_window: { value: 32000 } },
                    reasoning: {
                      effort: {
                        values: {
                          value: ['none', 'low', 'medium', 'high', 'xhigh'],
                        },
                      },
                    },
                  },
                },
              },
            ],
          }),
        ),
      ),
    );
    await loadModelRouterCatalog();
    current = 'chat';
    service = new ModelConfigService({
      aliases: { 'chat-base': { modelConfig: {} } },
    });
    session = new ModelRouterSessionConfig({
      getModel: () => current,
      setModel: (id: string) => {
        current = id;
      },
      getModelConfigService: () => service,
    } as unknown as Config);
  });

  afterEach(async () => {
    vi.stubEnv('GEMINI_MODEL_ROUTER', '');
    await loadModelRouterCatalog();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('advertises one entry per model and a separate model-specific effort option', () => {
    expect(routerAvailableModels().map((model) => model.modelId)).toEqual([
      'chat',
      'response',
    ]);
    expect(routerAvailableModels().map((model) => model.name)).toEqual([
      'chat',
      'response',
    ]);
    expect(session.getOptions()[1]).toMatchObject({
      id: 'reasoning_effort',
      currentValue: 'auto',
      options: [
        { value: 'auto' },
        { value: 'low' },
        { value: 'high' },
        { value: 'max' },
      ],
    });
    session.setOption('model', 'response');
    expect(session.getOptions()[1]).toMatchObject({
      options: [
        { value: 'auto' },
        { value: 'none' },
        { value: 'low' },
        { value: 'medium' },
        { value: 'high' },
        { value: 'xhigh' },
      ],
    });
  });

  it('changes effort independently, rejects unsupported levels, and restores defaults', () => {
    session.setOption('reasoning_effort', 'max');
    const resolve = () =>
      service.getResolvedConfig({ model: current, isChatModel: true });
    expect(resolve().generateContentConfig.httpOptions?.headers).toEqual({
      'x-model-router-reasoning-effort': 'max',
    });
    expect(() => session.setOption('reasoning_effort', 'medium')).toThrow(
      'Unsupported',
    );
    expect(resolve().generateContentConfig.httpOptions?.headers).toEqual({
      'x-model-router-reasoning-effort': 'max',
    });
    session.setOption('reasoning_effort', 'auto');
    expect(resolve().generateContentConfig.httpOptions).toBeUndefined();
  });
});
