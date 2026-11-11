# Frozen Benchmark Input Data

This directory contains frozen vocabulary and keyterm datasets used by the DhwaniFlow benchmark suite.

## Data Source & Snapshot Origin

- **Source Snapshot**: Repository tag `pre-dhwaniflow`.
- **Vocabulary Provenance**: The 22 code identifiers in [`sentences_project.json`](../sentences_project.json) and [`project-terms.json`](project-terms.json) were extracted from the codebase at the `pre-dhwaniflow` snapshot (prior to repository refactoring and branding changes). They represent historical identifiers from that exact revision, not the current working tree.

## Files

1. **`dev-terms.json`**:
   - 184 general developer keyterms (e.g. `API`, `Docker`, `useEffect`, `Kubernetes`, `PR`, `state`).
   - Used for default keyterm hinting (`_kt` variants) in the 30-sentence benchmark.

2. **`project-terms.json`**:
   - 22 repository-specific camelCase / PascalCase identifiers (e.g. `createMainWindow`, `setScreenContextProtection`, `normalizeToAccelerator`, `spawnWlCopy`).
   - Used for project-vocabulary evaluation (`project_kt` / `whisper_project_prompted`).

By freezing these files in `benchmark/data/`, the benchmark suite operates with zero runtime dependency on application code (`src/`) or external backend services.
