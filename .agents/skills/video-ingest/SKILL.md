---
name: video-ingest
description: Teaches the agent to process, ingest, analyze, and compare WebM, MP4, and GIF video recordings using vision-memory-mcp and state-memory-mcp.
---

# Video Frame Digesting & Temporal Memory Skill (video-ingest)

This skill provides step-by-step guidance, best practices, and operational patterns for digesting WebM, MP4, and GIF video recordings using `@putervision/vision-memory-mcp`.

---

## 1. When to Use Video Ingestion

Use video ingestion whenever you encounter:
- **E2E Playwright / Cypress / Selenium Test Artifacts**: Recorded `.webm` screenchunks or `.mp4` test run videos.
- **Bug Reproduction Videos**: User-uploaded screen recordings demonstrating UI glitches or crashes.
- **UI Walkthrough Recordings**: Demonstrations of complex multi-step user workflows.
- **Visual Regression Diagnostics**: Comparing a passing baseline video run against a failing test run.

---

## 2. Ingestion Strategies & Parameter Tuning

| Scenario | Recommended Parameters | Why |
| -------- | ---------------------- | --- |
| **Action Event Timestamps** *(Highest Precision)* | `action_timestamps: [1.2, 3.5, 7.0]` | Samples keyframes at exact interaction timestamps (clicks, types, navigation events) from test runners or state-memory logs. |
| **Dynamic UI / Animations** | `scene_threshold: 0.3`, `fps: 1` | Combines scene-change detection (`gt(scene,0.3)`) with 1 fps background sampling to capture major screen transitions without frame bloat. |
| **High-Speed Test Runs** | `fps: 2` or `fps: 5` | Increases frame rate sampling for rapidly switching UI test steps. |
| **Long Screen Recordings** | `fps: 0.5`, `scene_threshold: 0.4` | Lowers sampling rate to conserve storage while extracting unique keyframe states. |

---

## 3. Mandatory Dual-MCP Evidence Workflow

When diagnosing bugs or linking test runs to task nodes:

1. **Ingest Video**: Call `manage_video` (`action: "ingest"`) with file path and action timestamps.
2. **Extract Evidence Payload**: Read the returned `evidence_payload` containing `source_video_id`, `frame_range`, and `timestamps_ms`.
3. **Build Evidence Pack**: Call `create_evidence_pack` linking `keyframe_state_ids` with `state-memory-mcp` task or blocker node IDs.
4. **Compare Trajectories (On Failure)**: Call `compare_states(video_a_id: "...", video_b_id: "...")` to pinpoint exact frame divergence points.

---

## 4. CLI Quick Reference

```bash
# Ingest WebM / MP4 video recording with custom category
vision-memory-mcp video ingest ./recording.webm --category e2e_test

# Ingest with explicit action timestamps
vision-memory-mcp video ingest ./bug.mp4 --category bug_repro --action-timestamps 1.2,3.5,8.0

# Inspect chronological timeline & keyframes for a video ID
vision-memory-mcp video inspect vid_d7fc21c0ad52f861

# List all ingested video memory records
vision-memory-mcp video list
```

---

## 5. Consolidated Video MCP Tools Reference

- `manage_video` (`action: "ingest"`): Ingests video file/base64, extracts keyframes, dHash deduplicates, and generates CLIP vector embeddings.
- `manage_video` (`action: "timeline"`): Fetches step-by-step keyframes, exact timestamps (`timestamp_ms`), OCR snippets, and grounded target handles.
- `manage_video` (`action: "search"`): Searches video memory by description query, category, tags, or file path.
- `compare_states` (`video_a_id`, `video_b_id`): Calculates similarity score between two recordings and pinpoints exact timestamp divergence.
- `create_evidence_pack`: Produces an immutable, cryptographically hashable evidence pack payload linking keyframes to task graph nodes.
