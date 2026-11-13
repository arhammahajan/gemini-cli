/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getModelRouterCatalog,
  loadModelRouterCatalog,
} from './modelRouterCatalog.js';
import { outputTokenLimit, tokenLimit } from '../core/tokenLimits.js';

describe('model router catalog', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_MODEL_ROUTER', '1');
    vi.stubEnv('MODEL_ROUTER_URL', 'http://127.0.0.1:4000/');
    vi.stubEnv('MODEL_ROUTER_API_KEY', 'unused');
  });

  afterEach(async () => {
    vi.stubEnv('GEMINI_MODEL_ROUTER', '');
    await loadModelRouterCatalog();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses published context/output limits and exact effort vocabulary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'custom-model',
              metadata: {
                display_name: 'Custom Model',
                router: {
                  limits: {
                    context_window: { value: 500000 },
                    max_output_tokens: { value: 64000 },
                  },
                  reasoning: {
                    effort: { values: { value: ['low', 'high', 'max'] } },
                  },
                },
              },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await loadModelRouterCatalog();
    expect(getModelRouterCatalog().get('custom-model')?.efforts).toEqual([
      'low',
      'high',
      'max',
    ]);
    expect(tokenLimit('custom-model')).toBe(500000);
    expect(outputTokenLimit('custom-model')).toBe(64000);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:4000/v1/models');
  });

  it('does not invent limits or effort tiers for unknown facts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'unknown',
                metadata: {
                  router: { limits: { context_window: { value: null } } },
                },
              },
            ],
          }),
        ),
      ),
    );
    await loadModelRouterCatalog();
    expect(getModelRouterCatalog().get('unknown')).toMatchObject({
      efforts: [],
      contextWindow: undefined,
    });
  });

  it('makes no discovery requests without the opt-in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GEMINI_MODEL_ROUTER', '');
    await loadModelRouterCatalog();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getModelRouterCatalog().size).toBe(0);
  });
});
