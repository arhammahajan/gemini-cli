/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config, getModelRouterCatalog } from '@google/gemini-cli-core';
import * as acp from '@agentclientprotocol/sdk';

export function routerAvailableModels() {
  return [...getModelRouterCatalog().values()].map((model) => ({
    modelId: model.id,
    name: model.name,
    description: `Supported efforts: ${model.efforts.join(', ') || 'not published'}`,
  }));
}

export class ModelRouterSessionConfig {
  private readonly efforts = new Map<string, string>();

  constructor(private readonly config: Config) {}

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
    if (model?.efforts.length)
      options.push({
        id: 'reasoning_effort',
        name: 'Effort',
        category: 'thought_level',
        type: 'select',
        description:
          'Reasoning effort advertised by the selected router model.',
        currentValue: this.efforts.get(current) ?? 'auto',
        options: [
          { value: 'auto', name: 'Upstream default' },
          ...model.efforts.map((value) => ({ value, name: value })),
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
      !metadata?.efforts.length ||
      (value !== 'auto' && !metadata.efforts.includes(value))
    ) {
      throw new acp.RequestError(
        -32602,
        `Unsupported ${id}=${value} for ${model}`,
      );
    }
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
