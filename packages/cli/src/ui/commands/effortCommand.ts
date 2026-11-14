/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getModelRouterCatalog,
  type MessageActionReturn,
} from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';

export const effortCommand = {
  name: 'effort',
  altNames: ['thinking'],
  description:
    "Show or set the selected router model's reasoning effort: /effort [level|auto]",
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  showCompletionLoading: false,
  action(context, args): MessageActionReturn {
    const config = context.services.agentContext?.config;
    const model = config && getModelRouterCatalog().get(config.getModel());
    if (!config || !model) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Effort selection is available only for models in the model router catalog.',
      };
    }

    const value = args.trim();
    if (value) {
      try {
        config.setModelRouterEffort(value);
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const current = config.getModelRouterEffort();
    return {
      type: 'message',
      messageType: 'info',
      content: [
        `Effort for ${model.name} (${model.id}): ${current === 'auto' ? 'auto (upstream default)' : current}.`,
        `Supported efforts: ${['auto', ...model.efforts].join(', ')}.`,
        ...(model.efforts.length === 0
          ? [
              'No effort levels are published for this model; only auto is available.',
            ]
          : []),
      ].join('\n'),
    };
  },
  completion(context, partialArg) {
    const config = context.services.agentContext?.config;
    const model = config && getModelRouterCatalog().get(config.getModel());
    return model
      ? ['auto', ...model.efforts].filter((value) =>
          value.startsWith(partialArg),
        )
      : [];
  },
} satisfies SlashCommand;
