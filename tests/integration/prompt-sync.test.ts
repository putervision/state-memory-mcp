import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TOOL_ACTION_REGISTRY } from '../../src/engine/advisor.js';
import { LEGACY_TOOL_MAP } from '../../src/tools/compat-shim.js';

describe('Cross-Workspace Prompt & Instruction Linter Suite', () => {
  const registeredTools = new Set(Object.keys(TOOL_ACTION_REGISTRY));
  const legacyTools = new Set(Object.keys(LEGACY_TOOL_MAP));

  const dualMemoryVisionTools = new Set([
    'analyze_screenshot',
    'recall_memory',
    'record_outcome',
    'get_navigation_paths',
    'predict_next_action',
    'compare_states',
    'get_session_context',
    'manage_snapshot',
    'manage_visual_spec',
    'manage_video',
    'create_evidence_pack',
    'export_trajectories',
    'undo_visual_mutation',
    'forget_state',
    'wait_for_visual_state',
  ]);

  const worldModelTools = new Set([
    'update_entity',
    'query_entities',
    'set_relation',
    'get_spatial_map',
    'simulate_movement',
    'ingest_observation',
    'get_expected_view',
    'link_to_goal',
    'manage_spatial_spec',
    'use_spatial_blackboard',
    'generate_game_inputs',
    'wait_for_spatial_state',
  ]);

  const behaviorTools = new Set([
    'load_behavior',
    'set_parameters',
    'get_status',
    'abort_behavior',
    'register_trigger',
    'replay_recording',
    'get_metrics',
    'manage_behaviors',
    'manage_blackboard',
    'manage_runtime_db',
  ]);

  const reasoningTools = new Set([
    'set_goal',
    'evaluate_situation',
    'replan',
    'assess_risk',
    'query_knowledge',
    'set_utility_weights',
    'get_decision_trace',
    'manage_beliefs',
    'manage_intentions',
    'manage_reasoning_db',
  ]);

  const webcryptTools = new Set(['encrypt_payload', 'manage_keys', 'sign_verify']);

  const validIdentifiers = new Set<string>([
    ...Object.keys(TOOL_ACTION_REGISTRY),
    ...Object.keys(LEGACY_TOOL_MAP),
    ...Array.from(dualMemoryVisionTools),
    ...Array.from(worldModelTools),
    ...Array.from(behaviorTools),
    ...Array.from(reasoningTools),
    ...Array.from(webcryptTools),
  ]);

  for (const toolMeta of Object.values(TOOL_ACTION_REGISTRY)) {
    for (const actionName of Object.keys(toolMeta.actions)) {
      validIdentifiers.add(actionName);
      if (toolMeta.actions[actionName].aliases) {
        for (const alias of toolMeta.actions[actionName].aliases!) {
          validIdentifiers.add(alias);
        }
      }
    }
  }

  const instructionFiles = [
    path.resolve(process.cwd(), '.agents/AGENTS.md'),
    path.resolve(process.cwd(), '.agents/skills/state-memory-mcp/SKILL.md'),
    path.resolve(process.cwd(), 'CLAUDE.md'),
    path.resolve(process.cwd(), '.windsurfrules'),
    path.resolve(process.cwd(), 'docs/tools-reference.md'),
    path.resolve(process.cwd(), 'docs/api-reference.md'),
    path.resolve(process.cwd(), '../spc/.github/copilot-instructions.md'),
    path.resolve(process.cwd(), '../spc/.vscode/instructions.md'),
    path.resolve(process.cwd(), '../spc/CLAUDE.md'),
  ];

  it('should verify that all referenced tool and action names in prompt files are recognized', () => {
    for (const filePath of instructionFiles) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check all `tool_name` backtick patterns
      const backtickMatches = content.match(/`([a-z][a-z0-9_]{3,30})`/g) || [];
      const extractedNames = backtickMatches.map((m) => m.replace(/`/g, ''));

      for (const name of extractedNames) {
        if (
          name.startsWith('manage_') ||
          name.startsWith('get_') ||
          name.startsWith('query_') ||
          name.startsWith('run_') ||
          name.startsWith('use_')
        ) {
          const isValid = validIdentifiers.has(name);
          expect(
            isValid,
            `File ${filePath} references unknown tool or action: "${name}". Must be in registered tools, actions, or legacy map.`
          ).toBe(true);
        }
      }
    }
  });

  it('should ensure active prompt files prioritize consolidated tools over legacy tools', () => {
    const activeInstructions = [
      path.resolve(process.cwd(), '.agents/AGENTS.md'),
      path.resolve(process.cwd(), '../spc/.github/copilot-instructions.md'),
      path.resolve(process.cwd(), '../spc/.vscode/instructions.md'),
    ];

    for (const filePath of activeInstructions) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('manage_sessions');
      expect(content).toContain('get_analytics');
      expect(content).toContain('manage_tasks');
    }
  });
});
