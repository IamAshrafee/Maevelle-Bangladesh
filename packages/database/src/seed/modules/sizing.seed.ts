import { sql } from 'kysely';
import {
  addSizeGuideRow,
  createMeasurementDefinition,
  createSizeDefinition,
  createSizeGuide,
  createSizeSystem,
  createSizingDomain,
  publishSizeGuideRevision,
  setSizeGuideMeasurement,
  updateMeasurementDefinition,
  updateSizeDefinition,
  updateSizeGuide,
  updateSizeSystem,
  updateSizingDomain,
  type MeasurementUnit,
} from '../../sizing.js';
import {
  sizingSeedData,
  type SizingDomainSeedItem,
  type SizingSeedData,
} from '../data/sizing.js';
import type { SeedContext, SeedModule, SeedModuleResult } from '../types.js';

interface ExistingDomainRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly subject_type: string;
  readonly status: string;
}

interface ExistingSystemRow {
  readonly id: string;
  readonly sizing_domain_id: string;
  readonly code: string;
  readonly name: string;
  readonly region_code: string | null;
  readonly status: string;
}

interface ExistingDefinitionRow {
  readonly id: string;
  readonly size_system_id: string;
  readonly code: string;
  readonly label: string;
  readonly sort_order: number;
  readonly status: string;
}

interface ExistingMeasurementRow {
  readonly id: string;
  readonly sizing_domain_id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly sort_order: number;
  readonly subject_type: string;
  readonly default_unit: string;
  readonly status: string;
}

interface ExistingGuideRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sizing_domain_id: string;
  readonly size_system_id: string | null;
  readonly status: string;
  readonly current_published_revision_id: string | null;
  readonly version: string | number;
}

export function createSizingSeedModule(data: SizingSeedData = sizingSeedData): SeedModule {
  return {
    id: 'sizing',
    name: 'Sizing Foundation',
    description:
      'Sizing domains, size systems, size definitions, measurement definitions, and canonical guides',
    scope: 'bootstrap',
    dependencies: [],
    async run(context: SeedContext): Promise<SeedModuleResult> {
      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      // ─── 1. Sizing Domains ──────────────────────────────────────────────────
      const existingDomainRows = (
        await sql<ExistingDomainRow>`
          select id::text, code, name, subject_type, status
          from sizing.sizing_domains
          where organization_id = ${context.organizationId}
        `.execute(context.db)
      ).rows;

      const domainByCode = new Map<string, ExistingDomainRow>();
      for (const row of existingDomainRows) {
        domainByCode.set(row.code, row);
      }

      const domainIdByCode = new Map<string, string>();

      for (const item of data.domains) {
        const existing = domainByCode.get(item.code);
        if (!existing) {
          const created = await createSizingDomain(context.db, {
            organizationId: context.organizationId,
            code: item.code,
            name: item.name,
            subjectType: item.subjectType,
            actorId: context.actorId,
          });
          domainIdByCode.set(item.code, created.id);
          createdCount += 1;
        } else {
          domainIdByCode.set(item.code, existing.id);
          if (existing.name !== item.name) {
            await updateSizingDomain(context.db, {
              organizationId: context.organizationId,
              id: existing.id,
              name: item.name,
              actorId: context.actorId,
            });
            updatedCount += 1;
          } else {
            unchangedCount += 1;
          }
        }
      }

      // ─── 2. Size Systems ────────────────────────────────────────────────────
      const existingSystemRows = (
        await sql<ExistingSystemRow>`
          select id::text, sizing_domain_id::text, code, name, region_code, status
          from sizing.size_systems
          where organization_id = ${context.organizationId}
        `.execute(context.db)
      ).rows;

      const systemByCode = new Map<string, ExistingSystemRow>();
      for (const row of existingSystemRows) {
        systemByCode.set(row.code, row);
      }

      const systemIdByCode = new Map<string, string>();

      for (const system of data.systems) {
        const domainId = domainIdByCode.get(system.domainCode);
        if (!domainId) {
          throw new Error(`Domain code "${system.domainCode}" not found for system "${system.code}"`);
        }

        const existing = systemByCode.get(system.code);
        if (!existing) {
          const created = await createSizeSystem(context.db, {
            organizationId: context.organizationId,
            sizingDomainId: domainId,
            code: system.code,
            name: system.name,
            ...(system.regionCode ? { regionCode: system.regionCode } : {}),
            actorId: context.actorId,
          });
          systemIdByCode.set(system.code, created.id);
          createdCount += 1;
        } else {
          systemIdByCode.set(system.code, existing.id);
          const regionChanged = (existing.region_code ?? null) !== (system.regionCode ?? null);
          const nameChanged = existing.name !== system.name;
          if (regionChanged || nameChanged) {
            await updateSizeSystem(context.db, {
              organizationId: context.organizationId,
              id: existing.id,
              ...(nameChanged ? { name: system.name } : {}),
              ...(regionChanged ? { regionCode: system.regionCode ?? null } : {}),
              actorId: context.actorId,
            });
            updatedCount += 1;
          } else {
            unchangedCount += 1;
          }
        }
      }

      // ─── 3. Size Definitions ────────────────────────────────────────────────
      const existingDefinitionRows = (
        await sql<ExistingDefinitionRow>`
          select id::text, size_system_id::text, code, label, sort_order, status
          from sizing.size_definitions
          where organization_id = ${context.organizationId}
        `.execute(context.db)
      ).rows;

      const defBySystemAndCode = new Map<string, ExistingDefinitionRow>();
      for (const row of existingDefinitionRows) {
        defBySystemAndCode.set(`${row.size_system_id}:${row.code}`, row);
      }

      const sizeDefIdBySystemAndCode = new Map<string, string>();

      for (const system of data.systems) {
        const systemId = systemIdByCode.get(system.code)!;

        for (const size of system.sizes) {
          const key = `${systemId}:${size.code}`;
          const existing = defBySystemAndCode.get(key);

          if (!existing) {
            const created = await createSizeDefinition(context.db, {
              organizationId: context.organizationId,
              sizeSystemId: systemId,
              code: size.code,
              label: size.label,
              sortOrder: size.sortOrder ?? 0,
              actorId: context.actorId,
            });
            sizeDefIdBySystemAndCode.set(`${system.code}:${size.code}`, created.id);
            createdCount += 1;
          } else {
            sizeDefIdBySystemAndCode.set(`${system.code}:${size.code}`, existing.id);
            const labelChanged = existing.label !== size.label;
            const sortOrderChanged = Number(existing.sort_order) !== (size.sortOrder ?? 0);

            if (labelChanged || sortOrderChanged) {
              await updateSizeDefinition(context.db, {
                organizationId: context.organizationId,
                id: existing.id,
                ...(labelChanged ? { label: size.label } : {}),
                ...(sortOrderChanged ? { sortOrder: size.sortOrder ?? 0 } : {}),
                actorId: context.actorId,
              });
              updatedCount += 1;
            } else {
              unchangedCount += 1;
            }
          }
        }
      }

      // ─── 4. Measurement Definitions ─────────────────────────────────────────
      const existingMeasurementRows = (
        await sql<ExistingMeasurementRow>`
          select id::text, sizing_domain_id::text, code, name, description, instructions, sort_order, subject_type, default_unit, status
          from sizing.measurement_definitions
          where organization_id = ${context.organizationId}
        `.execute(context.db)
      ).rows;

      const measurementByDomainAndCode = new Map<string, ExistingMeasurementRow>();
      for (const row of existingMeasurementRows) {
        measurementByDomainAndCode.set(`${row.sizing_domain_id}:${row.code}`, row);
      }

      const measurementDefIdByDomainAndCode = new Map<string, string>();

      for (const m of data.measurements) {
        const domainId = domainIdByCode.get(m.domainCode);
        if (!domainId) {
          throw new Error(`Domain code "${m.domainCode}" not found for measurement "${m.code}"`);
        }

        const key = `${domainId}:${m.code}`;
        const existing = measurementByDomainAndCode.get(key);

        if (!existing) {
          const created = await createMeasurementDefinition(context.db, {
            organizationId: context.organizationId,
            sizingDomainId: domainId,
            code: m.code,
            name: m.name,
            subjectType: m.subjectType,
            defaultUnit: m.defaultUnit,
            ...(m.description ? { description: m.description } : {}),
            ...(m.instructions ? { instructions: m.instructions } : {}),
            sortOrder: m.sortOrder ?? 0,
            actorId: context.actorId,
          });
          measurementDefIdByDomainAndCode.set(`${m.domainCode}:${m.code}`, created.id);
          createdCount += 1;
        } else {
          measurementDefIdByDomainAndCode.set(`${m.domainCode}:${m.code}`, existing.id);
          const nameChanged = existing.name !== m.name;
          const unitChanged = existing.default_unit !== m.defaultUnit;
          const instructionsChanged = (existing.instructions ?? null) !== (m.instructions ?? null);
          const descriptionChanged = (existing.description ?? null) !== (m.description ?? null);
          const sortOrderChanged = Number(existing.sort_order) !== (m.sortOrder ?? 0);

          if (nameChanged || unitChanged || instructionsChanged || descriptionChanged || sortOrderChanged) {
            await updateMeasurementDefinition(context.db, {
              organizationId: context.organizationId,
              id: existing.id,
              ...(nameChanged ? { name: m.name } : {}),
              ...(unitChanged ? { defaultUnit: m.defaultUnit } : {}),
              ...(instructionsChanged ? { instructions: m.instructions ?? null } : {}),
              ...(descriptionChanged ? { description: m.description ?? null } : {}),
              ...(sortOrderChanged ? { sortOrder: m.sortOrder ?? 0 } : {}),
              actorId: context.actorId,
            });
            updatedCount += 1;
          } else {
            unchangedCount += 1;
          }
        }
      }

      // ─── 5. Size Guides ─────────────────────────────────────────────────────
      const existingGuideRows = (
        await sql<ExistingGuideRow>`
          select
            id::text,
            name,
            description,
            sizing_domain_id::text,
            size_system_id::text,
            status,
            current_published_revision_id::text,
            version
          from sizing.size_guides
          where organization_id = ${context.organizationId}
        `.execute(context.db)
      ).rows;

      const guideByName = new Map<string, ExistingGuideRow>();
      for (const row of existingGuideRows) {
        guideByName.set(row.name, row);
      }

      for (const guide of data.guides) {
        const domainId = domainIdByCode.get(guide.domainCode);
        if (!domainId) {
          throw new Error(`Domain code "${guide.domainCode}" not found for guide "${guide.name}"`);
        }
        const systemId = guide.systemCode ? systemIdByCode.get(guide.systemCode) ?? null : null;

        const existing = guideByName.get(guide.name);

        if (!existing) {
          // Create guide head record & draft revision 1
          const created = await createSizeGuide(context.db, {
            organizationId: context.organizationId,
            name: guide.name,
            sizingDomainId: domainId,
            ...(systemId ? { sizeSystemId: systemId } : {}),
            ...(guide.description ? { description: guide.description } : {}),
            actorId: context.actorId,
          });

          let currentRevisionVersion = 0;

          // Populate rows and measurements
          if (guide.rows && guide.rows.length > 0) {
            for (let i = 0; i < guide.rows.length; i++) {
              const rowItem = guide.rows[i]!;
              const sizeDefId =
                rowItem.sizeCode && guide.systemCode
                  ? sizeDefIdBySystemAndCode.get(`${guide.systemCode}:${rowItem.sizeCode}`)
                  : undefined;

              const addedRow = await addSizeGuideRow(context.db, {
                organizationId: context.organizationId,
                revisionId: created.revisionId,
                expectedVersion: currentRevisionVersion,
                displayLabel: rowItem.displayLabel,
                position: rowItem.position ?? i,
                ...(sizeDefId ? { sizeDefinitionId: sizeDefId } : {}),
                actorId: context.actorId,
              });
              currentRevisionVersion = addedRow.version;

              if (rowItem.measurements && rowItem.measurements.length > 0) {
                for (const m of rowItem.measurements) {
                  const mDefId = measurementDefIdByDomainAndCode.get(
                    `${guide.domainCode}:${m.measurementCode}`,
                  );
                  if (!mDefId) {
                    throw new Error(
                      `Measurement definition "${m.measurementCode}" not found for guide "${guide.name}"`,
                    );
                  }

                  await setSizeGuideMeasurement(context.db, {
                    organizationId: context.organizationId,
                    revisionId: created.revisionId,
                    rowId: addedRow.id,
                    measurementDefinitionId: mDefId,
                    expectedVersion: currentRevisionVersion,
                    unitCode: m.unitCode ?? 'cm',
                    ...(m.exact !== undefined ? { exact: m.exact } : {}),
                    ...(m.min !== undefined ? { min: m.min } : {}),
                    ...(m.max !== undefined ? { max: m.max } : {}),
                    ...(m.isApproximate !== undefined ? { isApproximate: m.isApproximate } : {}),
                    actorId: context.actorId,
                  });
                  currentRevisionVersion += 1;
                }
              }
            }

            // Publish if requested and rows have valid measurements
            if (guide.publishIfValid) {
              await publishSizeGuideRevision(context.db, {
                organizationId: context.organizationId,
                sizeGuideId: created.id,
                revisionId: created.revisionId,
                expectedVersion: currentRevisionVersion,
                actorId: context.actorId,
              });
            }
          }

          createdCount += 1;
        } else {
          // Check if guide head changed
          const nameChanged = existing.name !== guide.name;
          const descChanged = (existing.description ?? null) !== (guide.description ?? null);
          const systemChanged = (existing.size_system_id ?? null) !== systemId;

          if (nameChanged || descChanged || systemChanged) {
            await updateSizeGuide(context.db, {
              organizationId: context.organizationId,
              id: existing.id,
              expectedVersion: Number(existing.version),
              ...(nameChanged ? { name: guide.name } : {}),
              ...(descChanged ? { description: guide.description ?? null } : {}),
              ...(systemChanged ? { sizeSystemId: systemId } : {}),
              actorId: context.actorId,
            });
            updatedCount += 1;
          } else {
            unchangedCount += 1;
          }
        }
      }

      const totalCount = createdCount + updatedCount + unchangedCount;

      return {
        moduleId: 'sizing',
        moduleName: 'Sizing Foundation',
        totalCount,
        createdCount,
        updatedCount,
        unchangedCount,
        failedCount: 0,
      };
    },
  };
}

export const sizingSeedModule = createSizingSeedModule();
