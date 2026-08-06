import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KINDS = new Set(['platform_variant', 'legacy_compatibility']);
const RELEASE_STATUSES = new Set(['internal_prototype', 'blocked_rights', 'playable']);
const DIFFERENCE_CLASSIFICATIONS = new Set(['KEEP_COMPAT', 'CHANGE_RULESET', 'REMOVE_PLAYABLE']);
const CLAUSE_ID_PATTERN = /^[A-Z0-9-]+$/;
const RIGHTS_FIELDS = ['recordId', 'scope', 'expiresAt', 'rightsApprover', 'rulesApprover'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => isNonEmptyString(entry));
}

export function validateRuleTrace(trace, fileName) {
  const errors = [];
  if (!isPlainObject(trace)) return ['trace must be an object'];

  if (trace.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!isNonEmptyString(trace.rulesetId)) errors.push('rulesetId must be a non-empty string');
  if (!isNonEmptyString(trace.gameId)) errors.push('gameId must be a non-empty string');
  if (!KINDS.has(trace.kind)) errors.push('kind must be one of platform_variant, legacy_compatibility');
  if (!RELEASE_STATUSES.has(trace.releaseStatus)) {
    errors.push('releaseStatus must be one of internal_prototype, blocked_rights, playable');
  }
  if (!isNonEmptyStringArray(trace.sourceDocuments)) {
    errors.push('sourceDocuments must be a non-empty array of strings');
  }
  if (!isPlainObject(trace.policyVersions)) errors.push('policyVersions must be an object');
  if (trace.digitalBoundaries !== undefined && !isPlainObject(trace.digitalBoundaries)) {
    errors.push('digitalBoundaries must be an object when present');
  }
  if (!Array.isArray(trace.differences) || trace.differences.length === 0) {
    errors.push('differences must be a non-empty array');
  }
  if (!Array.isArray(trace.clauses) || trace.clauses.length === 0) {
    errors.push('clauses must be a non-empty array');
  }
  if (fileName !== undefined && isNonEmptyString(trace.rulesetId) && trace.rulesetId !== fileName) {
    errors.push(`rulesetId does not match file name ${fileName}`);
  }

  const clauseIds = new Set();
  const seenClauseIds = new Set();

  if (Array.isArray(trace.clauses)) {
    trace.clauses.forEach((clause, index) => {
      const label = clause && isNonEmptyString(clause.clauseId)
        ? `clause ${clause.clauseId}`
        : `clause #${index + 1}`;
      if (!isPlainObject(clause)) {
        errors.push(`${label}: must be an object`);
        return;
      }
      if (!isNonEmptyString(clause.clauseId) || !CLAUSE_ID_PATTERN.test(clause.clauseId)) {
        errors.push(`${label}: clauseId must match /^[A-Z0-9-]+$/`);
      } else {
        if (seenClauseIds.has(clause.clauseId)) errors.push(`duplicate clauseId: ${clause.clauseId}`);
        seenClauseIds.add(clause.clauseId);
        clauseIds.add(clause.clauseId);
      }
      if (!isNonEmptyString(clause.sourceSection)) errors.push(`${label}: sourceSection must be a non-empty string`);
      if (!isNonEmptyString(clause.sourceText)) errors.push(`${label}: sourceText must be a non-empty string`);
      if (!isNonEmptyStringArray(clause.transitionIds)) {
        errors.push(`${label}: transitionIds must be a non-empty array of strings`);
      } else {
        const seen = new Set();
        for (const id of clause.transitionIds) {
          if (seen.has(id)) errors.push(`${label}: duplicate transitionId ${id}`);
          seen.add(id);
        }
      }
      if (!isNonEmptyStringArray(clause.plannedTestIds)) {
        errors.push(`${label}: plannedTestIds must be a non-empty array of strings`);
      } else {
        const seen = new Set();
        for (const id of clause.plannedTestIds) {
          if (seen.has(id)) errors.push(`${label}: duplicate plannedTestId ${id}`);
          seen.add(id);
        }
      }
    });
  }

  if (Array.isArray(trace.differences)) {
    const seenDifferenceIds = new Set();
    trace.differences.forEach((difference, index) => {
      const label = difference && isNonEmptyString(difference.differenceId)
        ? `difference ${difference.differenceId}`
        : `difference #${index + 1}`;
      if (!isPlainObject(difference)) {
        errors.push(`${label}: must be an object`);
        return;
      }
      if (!isNonEmptyString(difference.differenceId)) {
        errors.push(`${label}: differenceId must be a non-empty string`);
      } else {
        if (seenDifferenceIds.has(difference.differenceId)) {
          errors.push(`duplicate differenceId: ${difference.differenceId}`);
        }
        seenDifferenceIds.add(difference.differenceId);
      }
      if (!DIFFERENCE_CLASSIFICATIONS.has(difference.classification)) {
        errors.push(`${label}: classification must be one of KEEP_COMPAT, CHANGE_RULESET, REMOVE_PLAYABLE`);
      }
      if (!isNonEmptyString(difference.baselineRulesetId)) {
        errors.push(`${label}: baselineRulesetId must be a non-empty string`);
      }
      if (!isNonEmptyString(difference.baselineBehavior)) {
        errors.push(`${label}: baselineBehavior must be a non-empty string`);
      }
      if (!isNonEmptyString(difference.targetBehavior)) {
        errors.push(`${label}: targetBehavior must be a non-empty string`);
      }
      if (!isNonEmptyStringArray(difference.relatedClauseIds)) {
        errors.push(`${label}: relatedClauseIds must be a non-empty array of strings`);
      } else {
        const seen = new Set();
        for (const clauseId of difference.relatedClauseIds) {
          if (seen.has(clauseId)) errors.push(`${label}: duplicate relatedClauseId ${clauseId}`);
          seen.add(clauseId);
          if (!clauseIds.has(clauseId)) {
            errors.push(`${label}: relatedClauseIds references unknown clauseId ${clauseId}`);
          }
        }
      }
    });
  }

  if (trace.releaseStatus === 'playable') {
    const evidence = trace.approvedEvidence;
    const complete = isPlainObject(evidence)
      && evidence.rightsStatus === 'approved'
      && RIGHTS_FIELDS.every((field) => isNonEmptyString(evidence[field]));
    if (!complete) {
      errors.push(
        'releaseStatus playable requires approvedEvidence with rightsStatus=approved and non-empty recordId, scope, expiresAt, rightsApprover, rulesApprover',
      );
    }
  }

  return errors;
}

export async function validateRuleTraces(root) {
  const rulesDir = resolve(root, 'compliance', 'rules');
  let entries;
  try {
    entries = await readdir(rulesDir, { withFileTypes: true });
  } catch (error) {
    return [`cannot read compliance/rules: ${error.message}`];
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) return ['no rule trace files found under compliance/rules'];

  const errors = [];
  for (const name of files) {
    let trace;
    try {
      trace = JSON.parse(await readFile(resolve(rulesDir, name), 'utf8'));
    } catch (error) {
      errors.push(`${name}: invalid JSON: ${error.message}`);
      continue;
    }
    const baseName = name.endsWith('.json') ? name.slice(0, -'.json'.length) : name;
    for (const message of validateRuleTrace(trace, baseName)) {
      errors.push(`${name}: ${message}`);
    }
  }
  return errors;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = resolve(process.argv[2] ?? '.');
  const errors = await validateRuleTraces(root);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Rule trace validation: PASS (${relative(resolve('.'), root) || '.'})`);
  }
}
