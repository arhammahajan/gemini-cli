/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getModelRouterCatalog,
  type MessageActionReturn,
} from '@google/gemini-cli-core';
import {
  CommandKind,
  type SlashCommand,
  type OpenCustomDialogActionReturn,
} from './types.js';
import { EffortDialog } from '../components/EffortDialog.js';

export const effortCommand = {
  name: 'effort',
  altNames: ['thinking'],
  description:
    "Select the router model's reasoning effort: /effort [level|auto]",
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  showCompletionLoading: false,
  action(context, args): MessageActionReturn | OpenCustomDialogActionReturn {
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
    if (!value) {
      return {
        type: 'custom_dialog',
        component: (
          <EffortDialog config={config} onClose={context.ui.removeComponent} />
        ),
      };
    }
    try {
      config.setModelRouterEffort(value);
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: error instanceof Error ? error.message : String(error),
      };
    }
    const current = config.getModelRouterEffort();
    return {
      type: 'message',
      messageType: 'info',
      content: `Effort for ${model.name} (${model.id}): ${current === 'auto' ? 'auto (upstream default)' : current}.`,
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
