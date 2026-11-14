/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { type Config, getModelRouterCatalog } from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import { Command } from '../key/keyMatchers.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';

interface EffortDialogProps {
  config: Config;
  onClose: () => void;
}

export function EffortDialog({ config, onClose }: EffortDialogProps) {
  const keyMatchers = useKeyMatchers();
  const model = getModelRouterCatalog().get(config.getModel());
  const current = config.getModelRouterEffort();
  const items = ['auto', ...(model?.efforts ?? [])].map((value) => ({
    key: value,
    value,
    title: `${value === 'auto' ? 'Upstream default (auto)' : value}${value === current ? ' (current)' : ''}`,
    description:
      value === 'auto' ? "Use the model provider's default effort." : undefined,
  }));

  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Effort</Text>
      <Text color={theme.text.secondary}>
        {model?.name ?? config.getModel()}
      </Text>
      {!model?.efforts.length && (
        <Text color={theme.text.secondary}>
          No effort levels are published for this model; only auto is available.
        </Text>
      )}
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={items}
          initialIndex={Math.max(
            0,
            items.findIndex((item) => item.value === current),
          )}
          showNumbers={true}
          onSelect={(value) => {
            config.setModelRouterEffort(value);
            onClose();
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          Arrow keys to move, Enter to select, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
}
