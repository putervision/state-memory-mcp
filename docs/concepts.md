# State Memory Concepts

`state-memory-mcp` models your development workspace as a directed acyclic graph (DAG) where nodes represent development objects and edges represent their semantic relationships.

---

## 📋 Node Types & Valid Status Values

1. **`task`**: Incremental items of work or coding TODOs  
   *Valid Statuses*: `pending`, `in_progress`, `done`, `blocked`, `cancelled`
2. **`decision`**: Architectural choices, pattern selections, and rationale  
   *Valid Statuses*: `active`, `accepted`, `deprecated`, `rejected`
3. **`artifact`**: Coding output, documentation, or schemas generated  
   *Valid Statuses*: `current`, `draft`, `deprecated`
4. **`plan`**: High-level development specifications and roadmaps containing milestones  
   *Valid Statuses*: `active`, `draft`, `completed`, `archived`
5. **`milestone`**: Progress checkpoints representing a grouped set of related tasks  
   *Valid Statuses*: `upcoming`, `in_progress`, `done`, `delayed`
6. **`blocker`**: Impediments or bugs preventing tasks from being completed  
   *Valid Statuses*: `active`, `resolved`, `mitigated`
7. **`observation`**: Contextual findings, codebase notes, or runtime constraints recorded by the agent  
   *Valid Statuses*: `active`, `archived`
8. **`visual_state`**: Represents a visual UI screenshot checkpoint via Dual MCP Synergy  
   *Valid Statuses*: `active`, `archived`, `invalidated`

---

## 🔗 Edge Relationships

Nodes are linked together to represent workflow connections:

* **`depends_on`**: Declares that a task or milestone depends on another.
* **`blocks`**: Connects a blocker to the task/milestone it stalls.
* **`produces`**: Connects a task or milestone to the file artifact it generates.
* **`references`**: Relates nodes to other source files or documentation.
* **`updates` / `contradicts`**: Traces the historical chain of decisions or flags conflicting requirements.
* **`part_of` / `child_of`**: Establishes hierarchical groupings (e.g., tasks belonging to milestones, milestones in plans).
* **`implements` / `decided_in`**: Links tasks/artifacts to their design decisions or plans.
* **`extends` / `modifies`**: Git commit trace relationships.
* **`renders_state` / `blocked_by_visual_state` / `verifies_visual_state`**: Visual memory cross-linking relationships.

> *Note: Cycle detection is automatically enforced. If an agent tries to link nodes in a loop (e.g. Task A blocking Task B which depends on Task A), the server immediately rejects the edge creation.*

---

## 🧠 Advanced Graph Queries

Exposing your state as a graph enables the server to run advanced graph query tools:

* **`critical_path`**: Computes the longest chain of unfinished tasks blocking a milestone so the agent knows what to prioritize.
* **`impact_analysis`**: Calculates the "blast radius" or downstream dependency chain affected if a node (or code file) is edited or deleted.
* **`detect_contradictions`**: Audits the database for logical flaws (e.g. finished tasks that still have active blockers, or contradicting design decisions).
* **`decision_trail`**: Traces the historical lineage of updates and contradictions back to the original architectural choice.
* **`get_event_log` / `get_node_history`**: Query the append-only event ledger and trace exactly when, how, and by whom a node was modified.
* **`undo_last`**: Reverts the last mutation on a node (rollback) to recover from a downstream reasoning or testing failure (FSM State Traceback).

---

## 💡 Project Seeding Guidelines

For maximum developer-agent alignment, seed your graph immediately after initializing the project:

1. **Add a Plan Node**: Create a high-level `plan` node representing your project roadmap:
   - `add_node(type: "plan", title: "Project Roadmap")`
2. **Define Milestones**: Establish target milestones representing project phases and link them to the plan:
   - `add_node(type: "milestone", title: "v1.0 MVP Release")`
   - `add_edge(source_id: mvp_id, target_id: roadmap_id, type: "part_of")`
3. **Log Core Decisions**: Create `decision` nodes describing architectural components and link them to the milestones:
   - `add_node(type: "decision", title: "SQLite Database Choice", metadata: { "rationale": "Simple, local storage" })`
   - `add_edge(source_id: db_choice_id, target_id: mvp_id, type: "decided_in")`
