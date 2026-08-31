import { finding } from '../lib/lab-util.mjs';

const BANNED = new Set(['项目A', '项目B', '项目C']);

function walk(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) visit(k, v);
    for (const v of Object.values(value)) walk(v, visit);
  }
}

export function checkRoleLiterals({ naming, plane } = {}) {
  const findings = [];
  const inspect = (label, obj) => {
    if (!obj) return;
    walk(obj, (key, value) => {
      if (['id', 'origin_project', 'requirement_owner', 'lead_project', 'role'].includes(key)
        && typeof value === 'string' && BANNED.has(value)) {
        findings.push(finding('L2-ROLE', `${label} ${key}=${value}`, 'Use notes-alpha / notes-beta.'));
      }
      if (key === 'targets' && Array.isArray(value)) {
        for (const t of value) {
          const id = typeof t === 'string' ? t : t?.project_id;
          if (typeof id === 'string' && BANNED.has(id)) {
            findings.push(finding('L2-ROLE', `${label} target ${id}`, 'Do not use 项目A/B/C.'));
          }
        }
      }
    });
  };
  inspect('naming', naming);
  inspect('plane', plane);
  return { ok: findings.length === 0, findings };
}
