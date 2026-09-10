---
name: world-model-mcp
description: Teaches the agent to use the Spatial World Model MCP server to track entities, 3D/2D positions, spatial relationships, object permanence, and movement simulation.
---

# Spatial World Model (world-model-mcp)

This skill provides step-by-step guidance and operational patterns for interacting with `@putervision/world-model-mcp`.

---

## 1. Role in the PuterVision Triad
- **Perception Layer** (`vision-memory-mcp`): Ingests images, detects bounding boxes, extracts OCR.
- **World Model Layer** (`world-model-mcp`): Maintains persistent 3D/2D coordinates, bounding volumes, topological relations, and object permanence.
- **Action/State Layer** (`state-memory-mcp`): Manages task execution DAGs, decisions, blockers, and milestones.

---

## 2. Core Operational Sequence
1. **Inspect World**: Call `get_spatial_map` with `format: 'summary'` to check total entities and spatial bounding box.
2. **Proximity Lookup**: Call `query_entities` with `near_position` and `max_distance`, or `entity_id` for direct lookup.
3. **Ingest Perception**: When new visual elements are detected, call `ingest_observation`.
4. **Collision Pre-Check**: Call `simulate_movement` before issuing action commands.
5. **Update State**: Call `record_outcome` after actions complete.

---

## 3. Tool Reference (15 Tools)

| Tool Name | Key Inputs | Description |
|-----------|------------|-------------|
| `update_entity` | name, type, position, bounding_box, properties | Upsert entity into spatial memory |
| `query_entities` | query, type, near_position, entity_id, include_history | Find entities by text search, proximity, or entity ID |
| `set_relation` | source_id, relation, target_id, offset | Record spatial relationship (on, inside, near, etc.) |
| `get_spatial_map` | region_id, format (json, gltf, obj, summary) | Export structured spatial layout or summary |
| `simulate_movement` | entity_id, delta_position, mode, check_collisions | Predict movement path or compute navigation waypoints |
| `ingest_observation` | observer_pose, detections, visual_state_id, reconcile | Ingest perception detections and reconcile frustum view |
| `get_expected_view` | observer_position, observer_orientation, fov | Calculate visible entities from observer pose |
| `link_to_goal` | task_id, entity_id, relationship, action | Associate entity with task or extract spatial slice |
| `record_outcome` | action_name, success, resulting_position | Update world state after action completion |
| `manage_spatial_spec` | action, name, bounds, constraints | Spatial SDD contract registration and verification |
| `create_evidence_pack` | task_id, entity_ids, snapshot_ids | Immutable cryptographic evidence package |
| `use_spatial_blackboard` | action, topic, sender, payload | Multi-agent coordination and mutex locks |
| `manage_snapshot` | action, name, snapshot_a, snapshot_b, entity_id | Snapshots, diffs, undo mutations, and time-travel |
| `generate_game_inputs` | entity_id, target_position, control_profile, action | Playwright game inputs and screen coordinate projection |
| `wait_for_spatial_state` | entity_id, condition, threshold, timeout_ms | Polling and waiting for spatial state condition |
