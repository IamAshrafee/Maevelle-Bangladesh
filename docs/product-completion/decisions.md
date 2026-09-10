# Decisions

| Decision | Rationale |
| --- | --- |
| Restore a small V2 system rather than the deleted tracker verbatim. | The former 33-file system was removed; current state needs a durable pointer, not documentation theater. |
| Start with Admin Product Management Workspace. | It is business-critical, recently changed after tracker deletion, bounded for assessment, and has uncertain current workflow evidence. |
| Do not inherit historical Catalog stages or verified claims. | Later commits changed the implementation and the old tracker itself said no area was verified complete. |
| Use `CODE_SUBSTANTIAL` for broad source-backed areas. | It accurately distinguishes implementation breadth from current acceptance evidence. |
