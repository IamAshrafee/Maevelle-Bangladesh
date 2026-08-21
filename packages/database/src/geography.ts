import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';

export class GeographyDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'VALIDATION_FAILED' | 'HIERARCHY_CYCLE',
    message: string,
  ) {
    super(message);
    this.name = 'GeographyDomainError';
  }
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export async function createGeographyDataset(
  db: Kysely<DatabaseSchema>,
  input: { code: string; version: string; sourceName: string; sourceUrl?: string },
): Promise<{ id: string }> {
  const result = await sql<{
    id: string;
  }>`insert into geography.datasets (code, version, source_name, source_url) values (${input.code}, ${input.version}, ${input.sourceName}, ${input.sourceUrl ?? null}) returning id`.execute(
    db,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Geography dataset creation did not return an id.');
  return { id };
}

export interface GeographyImportNode {
  readonly sourceCode: string;
  readonly parentSourceCode?: string;
  readonly nodeType: string;
  readonly canonicalName: string;
  readonly localName?: string;
  readonly aliases?: readonly { value: string; languageCode?: string }[];
}

/**
 * Repeatable importer for vetted reference files. It never fetches data at
 * runtime and keys every node by a source code within its dataset version.
 */
export async function importGeographyDataset(
  db: Kysely<DatabaseSchema>,
  input: {
    code: string;
    version: string;
    sourceName: string;
    sourceUrl?: string;
    nodes: readonly GeographyImportNode[];
  },
): Promise<{ datasetId: string; imported: boolean }> {
  return db.transaction().execute(async (transaction) => {
    const existing = await sql<{ id: string }>`
      select id from geography.datasets where code = ${input.code} and version = ${input.version}
    `.execute(transaction);
    if (existing.rows[0]) return { datasetId: existing.rows[0].id, imported: false };
    const dataset = await createGeographyDataset(transaction, {
      code: input.code,
      version: input.version,
      sourceName: input.sourceName,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    });
    const bySource = new Map<string, string>();
    const pending = [...input.nodes];
    while (pending.length > 0) {
      const availableIndex = pending.findIndex(
        (node) => !node.parentSourceCode || bySource.has(node.parentSourceCode),
      );
      if (availableIndex < 0) {
        throw new GeographyDomainError(
          'VALIDATION_FAILED',
          'Geography import contains a missing parent or hierarchy cycle.',
        );
      }
      const [node] = pending.splice(availableIndex, 1);
      if (!node) continue;
      const created = await createGeographyNode(transaction, {
        datasetId: dataset.id,
        nodeType: node.nodeType,
        canonicalName: node.canonicalName,
        sourceCode: node.sourceCode,
        ...(node.parentSourceCode ? { parentId: bySource.get(node.parentSourceCode)! } : {}),
        ...(node.localName ? { localName: node.localName } : {}),
      });
      bySource.set(node.sourceCode, created.id);
      for (const alias of node.aliases ?? []) {
        await addGeographyAlias(transaction, {
          nodeId: created.id,
          alias: alias.value,
          sourceName: input.sourceName,
          ...(alias.languageCode ? { languageCode: alias.languageCode } : {}),
        });
      }
    }
    return { datasetId: dataset.id, imported: true };
  });
}

export async function createGeographyNode(
  db: Kysely<DatabaseSchema>,
  input: {
    datasetId?: string;
    parentId?: string;
    nodeType: string;
    canonicalName: string;
    localName?: string;
    sourceCode?: string;
  },
): Promise<{ id: string }> {
  if (!input.canonicalName.trim())
    throw new GeographyDomainError('VALIDATION_FAILED', 'Canonical name is required.');
  if (input.parentId) {
    const parent = await sql<{
      id: string;
    }>`select id from geography.nodes where id = ${input.parentId}`.execute(db);
    if (!parent.rows[0])
      throw new GeographyDomainError('NOT_FOUND', 'Parent geography node was not found.');
  }
  const result = await sql<{
    id: string;
  }>`insert into geography.nodes (dataset_id, parent_id, node_type, canonical_name, local_name, source_code) values (${input.datasetId ?? null}, ${input.parentId ?? null}, ${input.nodeType}, ${input.canonicalName.trim()}, ${input.localName?.trim() ?? null}, ${input.sourceCode?.trim() ?? null}) returning id`.execute(
    db,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Geography node creation did not return an id.');
  return { id };
}

/** Recursively follows the prospective parent chain; a node may never become its own ancestor. */
export async function moveGeographyNode(
  db: Kysely<DatabaseSchema>,
  input: { nodeId: string; parentId?: string | null; expectedVersion: number },
): Promise<{ version: number }> {
  if (input.parentId) {
    const ancestor = await sql<{
      id: string;
    }>`with recursive lineage as (select id, parent_id from geography.nodes where id = ${input.parentId} union all select node.id, node.parent_id from geography.nodes node join lineage on node.id = lineage.parent_id) select id from lineage where id = ${input.nodeId}`.execute(
      db,
    );
    if (ancestor.rows[0])
      throw new GeographyDomainError(
        'HIERARCHY_CYCLE',
        'A geography node cannot become its own ancestor.',
      );
  }
  const changed = await sql<{
    version: string;
  }>`update geography.nodes set parent_id = ${input.parentId ?? null}, version = version + 1, updated_at = now() where id = ${input.nodeId} and version = ${input.expectedVersion} returning version::text`.execute(
    db,
  );
  const version = changed.rows[0]?.version;
  if (!version)
    throw new GeographyDomainError('NOT_FOUND', 'Geography node was not found or is stale.');
  return { version: Number(version) };
}

export async function addGeographyAlias(
  db: Kysely<DatabaseSchema>,
  input: { nodeId: string; alias: string; languageCode?: string; sourceName?: string },
): Promise<void> {
  const alias = input.alias.trim();
  if (!alias) throw new GeographyDomainError('VALIDATION_FAILED', 'Alias is required.');
  await sql`insert into geography.node_aliases (node_id, alias, normalized_alias, language_code, source_name) values (${input.nodeId}, ${alias}, ${normalize(alias)}, ${input.languageCode ?? null}, ${input.sourceName ?? null})`.execute(
    db,
  );
}

export async function searchGeography(
  db: Kysely<DatabaseSchema>,
  query: string,
): Promise<
  readonly {
    id: string;
    name: string;
    localName: string | null;
    nodeType: string;
    parentName: string | null;
  }[]
> {
  const needle = `%${normalize(query)}%`;
  const result = await sql<{
    id: string;
    canonical_name: string;
    local_name: string | null;
    node_type: string;
    parent_name: string | null;
  }>`select distinct node.id, node.canonical_name, node.local_name, node.node_type, parent.canonical_name as parent_name from geography.nodes node left join geography.nodes parent on parent.id = node.parent_id left join geography.node_aliases alias on alias.node_id = node.id where node.status = 'ACTIVE' and (lower(node.canonical_name) like ${needle} or lower(coalesce(node.local_name, '')) like ${needle} or alias.normalized_alias like ${needle}) order by node.canonical_name, node.id limit 50`.execute(
    db,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.canonical_name,
    localName: row.local_name,
    nodeType: row.node_type,
    parentName: row.parent_name,
  }));
}
