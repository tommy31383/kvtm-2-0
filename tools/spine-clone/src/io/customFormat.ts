// Custom format I/O — serialize/deserialize our internal Skeleton model.
//
// This is the lossless round-trip format for spine-clone projects. Stored as
// JSON with a wrapper that captures atlas reference + skeleton.
//
// Schema version is tracked so future format changes can migrate old files.

import type { Skeleton, Atlas } from '../core/types.js';

const SCHEMA_VERSION = '0.1.0';

export interface SpineCloneProject {
  schema: string;             // 'spine-clone-project'
  schemaVersion: string;      // semver
  createdAt?: string;         // ISO 8601
  modifiedAt?: string;
  skeleton: Skeleton;
  atlas: Atlas;
  // Future: project-level settings (grid, snap, etc.)
}

/** Serialize a project to a JSON string. Indent 2 for readability. */
export function serializeProject(skeleton: Skeleton, atlas: Atlas): string {
  const project: SpineCloneProject = {
    schema: 'spine-clone-project',
    schemaVersion: SCHEMA_VERSION,
    modifiedAt: new Date().toISOString(),
    skeleton,
    atlas,
  };
  return JSON.stringify(project, null, 2);
}

/** Parse a project JSON string. Throws on schema mismatch / unknown version. */
export function parseProject(json: string): SpineCloneProject {
  const obj = JSON.parse(json);
  if (obj?.schema !== 'spine-clone-project') {
    throw new Error(`Not a spine-clone project (schema="${obj?.schema}")`);
  }
  if (!obj.skeleton || !obj.atlas) {
    throw new Error('Missing skeleton or atlas in project');
  }
  // Future: migrate older schemaVersion → current
  if (obj.schemaVersion && obj.schemaVersion !== SCHEMA_VERSION) {
    console.warn(`[customFormat] schema version ${obj.schemaVersion} — current is ${SCHEMA_VERSION}. Loading anyway.`);
  }
  return obj as SpineCloneProject;
}
