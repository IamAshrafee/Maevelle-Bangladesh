# Asset Management Context

The implementation is based on HEAD Finance/Owner Capital, Procurement, Warehouse, IAM, Media, Audit, and Admin conventions. The architecture decision record is [Asset Management Architecture](../../../domains/assets/asset-management-architecture.md).

Resume by starting Docker/PostgreSQL, rebuilding the disposable database from checked-in migrations, running `packages/database/src/assets.test.ts`, and reviewing `/admin/assets` through acquisition, assignment, movement, maintenance, document, sale, disposal, and lost/recovery workflows.
