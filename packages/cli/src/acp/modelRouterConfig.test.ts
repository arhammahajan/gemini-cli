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
  let config: Config;

  beforeEach(async () => {
    vi.stubEnv('GEMINI_MODEL_ROUTER', '1');
    vi.stubEnv('GEMINI_ACP_SHARED_EFFORT_CONTROL', '');
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
              { id: 'unknown' },
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
    config = {
      getModel: () => current,
      setModel: (id: string) => {
        current = id;
      },
      getModelConfigService: () => service,
    } as unknown as Config;
    session = new ModelRouterSessionConfig(config);
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
      'unknown',
    ]);
    expect(routerAvailableModels().map((model) => model.name)).toEqual([
      'chat',
      'response',
      'unknown',
    ]);
    expect(session.getOptions()[1]).toMatchObject({
      id: 'reasoning_effort',
      category: 'thought_level',
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

  it('opts into a stable shared menu while validating the selected model', () => {
    vi.stubEnv('GEMINI_ACP_SHARED_EFFORT_CONTROL', '1');
    session = new ModelRouterSessionConfig(config);
    const shared = session.getOptions()[1];
    expect(shared).not.toHaveProperty('category');
    expect(shared).toMatchObject({
      id: 'reasoning_effort',
      options: ['auto', 'none', 'low', 'medium', 'high', 'xhigh', 'max'].map(
        (value) => ({ value }),
      ),
    });
    session.setOption('reasoning_effort', 'max');
    session.setModel('response');
    expect(session.getOptions()[1]).toEqual(shared);
    expect(() => session.setOption('reasoning_effort', 'max')).toThrow(
      'Supported efforts: auto, none, low, medium, high, xhigh',
    );
    expect(() => session.assertValid()).toThrow('Unsupported');
    session.setOption('reasoning_effort', 'xhigh');
    expect(() => session.assertValid()).not.toThrow();
    session.setModel('chat');
    expect(session.getOptions()[1].currentValue).toBe('max');

    session.setModel('unknown');
    expect(session.getOptions()[1]).toEqual(shared);
    expect(() => session.setOption('reasoning_effort', 'low')).toThrow(
      'Supported efforts: auto.',
    );
    session.setOption('reasoning_effort', 'auto');
    expect(() => session.assertValid()).not.toThrow();
  });

  it('hides model-specific effort when no vocabulary was published', () => {
    session.setModel('unknown');
    expect(session.getOptions()).toHaveLength(1);
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
    expect(() => session.assertValid()).toThrow(
      'Supported efforts: auto, low, high, max',
    );
    expect(resolve().generateContentConfig.httpOptions?.headers).toEqual({
      'x-model-router-reasoning-effort': 'max',
    });
    session.setOption('reasoning_effort', 'auto');
    expect(() => session.assertValid()).not.toThrow();
    expect(resolve().generateContentConfig.httpOptions).toBeUndefined();
  });
});
