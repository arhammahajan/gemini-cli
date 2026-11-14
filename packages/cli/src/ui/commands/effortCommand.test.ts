/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Config, loadModelRouterCatalog } from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { type CommandContext } from './types.js';
import { effortCommand } from './effortCommand.js';

describe('/effort (alias /thinking)', () => {
  let config: Config;
  let context: CommandContext;

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
      sessionId: 'terminal-effort-test',
      targetDir: process.cwd(),
      cwd: process.cwd(),
      model: 'chat',
      debugMode: false,
      modelConfigServiceConfig: {
        aliases: { 'chat-base': { modelConfig: {} } },
      },
    });
    context = createMockCommandContext();
    context.services.agentContext = config;
  });

  afterEach(async () => {
    vi.stubEnv('GEMINI_MODEL_ROUTER', '');
    await loadModelRouterCatalog();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('opens a picker without arguments for either command name', () => {
    expect(effortCommand.action(context, '')).toMatchObject({
      type: 'custom_dialog',
    });
    expect(effortCommand.altNames).toEqual(['thinking']);
  });

  it('completes the exact vocabulary again after switching models', () => {
    expect(effortCommand.completion(context, '')).toEqual([
      'auto',
      'low',
      'high',
      'max',
    ]);
    expect(effortCommand.completion(context, 'm')).toEqual(['max']);
    config.setModel('response');
    expect(effortCommand.completion(context, '')).toEqual([
      'auto',
      'none',
      'medium',
      'xhigh',
    ]);
    expect(effortCommand.completion(context, 'l')).toEqual([]);
  });

  it("applies exact values and restores each model's choice when switching back", () => {
    expect(effortCommand.action(context, ' max ')).toMatchObject({
      messageType: 'info',
    });
    config.setModel('response');
    effortCommand.action(context, 'xhigh');
    expect(
      config
        .getModelConfigService()
        .getResolvedConfig({ model: 'response', isChatModel: true })
        .generateContentConfig.httpOptions?.headers,
    ).toEqual({ 'x-model-router-reasoning-effort': 'xhigh' });
    config.setModel('chat');
    expect(config.getModelRouterEffort()).toBe('max');
  });

  it('rejects unsupported levels without changing the previous valid value', () => {
    effortCommand.action(context, 'high');
    expect(effortCommand.action(context, 'medium')).toMatchObject({
      messageType: 'error',
      content: expect.stringContaining(
        'Supported efforts: auto, low, high, max',
      ),
    });
    expect(config.getModelRouterEffort()).toBe('high');
    expect(effortCommand.action(context, 'high extra')).toMatchObject({
      messageType: 'error',
    });
    expect(effortCommand.action(context, 'off')).toMatchObject({
      messageType: 'error',
    });
  });

  it('restores upstream defaults with auto', () => {
    effortCommand.action(context, 'max');
    expect(effortCommand.action(context, 'auto')).toMatchObject({
      messageType: 'info',
      content: expect.stringContaining('auto (upstream default)'),
    });
    expect(
      config
        .getModelConfigService()
        .getResolvedConfig({ model: 'chat', isChatModel: true })
        .generateContentConfig.httpOptions,
    ).toBeUndefined();
  });

  it('explains unknown capabilities and permits only auto', () => {
    config.setModel('unknown');
    expect(effortCommand.action(context, '')).toMatchObject({
      type: 'custom_dialog',
    });
    expect(effortCommand.completion(context, '')).toEqual(['auto']);
    expect(effortCommand.action(context, 'low')).toMatchObject({
      messageType: 'error',
    });
    expect(effortCommand.action(context, 'auto')).toMatchObject({
      messageType: 'info',
    });
  });

  it('reports unavailable configuration without inventing choices', () => {
    context.services.agentContext = null;
    expect(effortCommand.action(context, 'high')).toMatchObject({
      messageType: 'error',
    });
    expect(effortCommand.completion(context, '')).toEqual([]);
    context.services.agentContext = config;
    config.setModel('gemini-2.5-pro');
    expect(effortCommand.action(context, 'high')).toMatchObject({
      messageType: 'error',
    });
    expect(effortCommand.completion(context, '')).toEqual([]);
  });
});
