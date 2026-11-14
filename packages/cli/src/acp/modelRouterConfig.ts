/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config, getModelRouterCatalog } from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';

// Order known levels by intensity, then preserve any future published values.
const effortOrder = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export function routerAvailableModels() {
  return [...getModelRouterCatalog().values()].map((model) => ({
    modelId: model.id,
    name: model.name,
    description: `Supported efforts: ${model.efforts.join(', ') || 'not published'}`,
  }));
}

export class ModelRouterSessionConfig {
  private readonly efforts = new Map<string, string>();
  private validationError: string | undefined;
  // T3 discovers only the default model. An uncategorized control is shared
  // across its catalog; other ACP clients retain exact per-model menus.
  private readonly sharedEffortControl =
    process.env['GEMINI_ACP_SHARED_EFFORT_CONTROL'] === '1';

  constructor(private readonly config: Config) {}

  assertValid(): void {
    if (this.validationError)
      throw new acp.RequestError(-32602, this.validationError);
  }

  getOptions(): acp.SessionConfigOption[] {
    const models = routerAvailableModels();
    if (models.length === 0) return [];
    const current = this.config.getModel();
    const model = getModelRouterCatalog().get(current);
    const options: acp.SessionConfigOption[] = [
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: current,
        options: models.map(({ modelId, name, description }) => ({
          value: modelId,
          name,
          description,
        })),
      },
    ];
    const efforts = this.sharedEffortControl
      ? [
          ...new Set(
            [...getModelRouterCatalog().values()].flatMap((m) => m.efforts),
          ),
        ].sort((a, b) => {
          const rank = (value: string) => {
            const index = effortOrder.indexOf(value);
            return index < 0 ? effortOrder.length : index;
          };
          return rank(a) - rank(b) || a.localeCompare(b);
        })
      : (model?.efforts ?? []);
    if (efforts.length)
      options.push({
        id: 'reasoning_effort',
        name: 'Effort',
        ...(this.sharedEffortControl ? {} : { category: 'thought_level' }),
        type: 'select',
        description: this.sharedEffortControl
          ? 'Combined router effort choices. Unsupported values are rejected for the selected model; Upstream default works for every model.'
          : 'Reasoning effort advertised by the selected router model.',
        currentValue: this.efforts.get(current) ?? 'auto',
        options: [
          { value: 'auto', name: 'Upstream default' },
          ...efforts.map((value) => ({ value, name: value })),
        ],
      });
    return options;
  }

  setModel(modelId: string): void {
    if (
      getModelRouterCatalog().size > 0 &&
      !getModelRouterCatalog().has(modelId)
    ) {
      throw new acp.RequestError(-32602, `Unknown router model: ${modelId}`);
    }
    this.config.setModel(modelId);
    this.validationError = undefined;
    if (getModelRouterCatalog().has(modelId)) this.applyEffort(modelId);
  }

  setOption(id: string, value: string | boolean): void {
    if (typeof value !== 'string')
      throw new acp.RequestError(-32602, 'Expected a string option value');
    if (id === 'model') {
      this.setModel(value);
      return;
    }
    const model = this.config.getModel();
    const metadata = getModelRouterCatalog().get(model);
    if (
      id !== 'reasoning_effort' ||
      !metadata ||
      (value !== 'auto' && !metadata.efforts.includes(value))
    ) {
      const message = `Unsupported ${id}=${value} for ${model}. Supported efforts: auto${metadata?.efforts.length ? ', ' + metadata.efforts.join(', ') : ''}.`;
      // Some ACP clients ignore set-option failures. Never let a rejected
      // effort silently turn into a generation with the previous/default one.
      if (id === 'reasoning_effort') this.validationError = message;
      throw new acp.RequestError(-32602, message);
    }
    this.validationError = undefined;
    this.efforts.set(model, value);
    this.applyEffort(model);
  }

  private applyEffort(model: string): void {
    const effort = this.efforts.get(model) ?? 'auto';
    this.config.getModelConfigService().registerRuntimeModelConfig(model, {
      extends: 'chat-base',
      modelConfig: {
        model,
        generateContentConfig: {
          thinkingConfig: { includeThoughts: true },
          ...(effort === 'auto'
            ? {}
            : {
                httpOptions: {
                  headers: { 'x-model-router-reasoning-effort': effort },
                },
              }),
        },
      },
    });
  }
}
