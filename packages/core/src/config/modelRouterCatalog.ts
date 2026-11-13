/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

const limitFact = z
  .object({ value: z.number().int().positive().nullable() })
  .optional();
const inventorySchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      metadata: z
        .object({
          display_name: z.string().optional(),
          router: z
            .object({
              limits: z
                .object({
                  context_window: limitFact,
                  max_output_tokens: limitFact,
                })
                .optional(),
              reasoning: z
                .object({
                  effort: z
                    .object({
                      values: z
                        .object({
                          value: z.array(z.string().min(1)).nullable(),
                        })
                        .optional(),
                    })
                    .optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    }),
  ),
});

export interface ModelRouterEntry {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  efforts: string[];
}

let catalog = new Map<string, ModelRouterEntry>();

export function getModelRouterCatalog(): ReadonlyMap<string, ModelRouterEntry> {
  return catalog;
}

/** Opt-in discovery; normal Gemini authentication and model metadata are untouched. */
export async function loadModelRouterCatalog(): Promise<void> {
  if (process.env['GEMINI_MODEL_ROUTER'] !== '1') {
    catalog = new Map();
    return;
  }
  const origin = (
    process.env['MODEL_ROUTER_URL'] ?? 'http://127.0.0.1:4000'
  ).replace(/\/+$/, '');
  const response = await fetch(`${origin}/v1/models`, {
    headers: {
      Authorization: `Bearer ${process.env['MODEL_ROUTER_API_KEY'] ?? 'unused'}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Model router inventory returned HTTP ${response.status}`);
  const inventory = inventorySchema.parse(await response.json());
  if (inventory.data.length === 0)
    throw new Error('Model router inventory is empty');
  catalog = new Map(
    inventory.data.map((entry) => {
      const facts = entry.metadata?.router;
      return [
        entry.id,
        {
          id: entry.id,
          name: entry.metadata?.display_name ?? entry.id,
          contextWindow: facts?.limits?.context_window?.value ?? undefined,
          maxOutputTokens: facts?.limits?.max_output_tokens?.value ?? undefined,
          efforts: [...new Set(facts?.reasoning?.effort?.values?.value ?? [])],
        },
      ];
    }),
  );
}
