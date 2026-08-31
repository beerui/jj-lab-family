import fs from 'node:fs';
import path from 'node:path';
import { finding, wrap } from '../lib/lab-util.mjs';

export function checkUnauthorizedTarget(root) {
  const findings = [];
  const gamma = path.join(wrap(root), 'notes-gamma');
  if (fs.existsSync(gamma)) {
    findings.push(finding('L2-S3b', 'notes-gamma/ exists', 'Do not seed an unauthorized third business repo.'));
  }
  const loopEnv = process.env.JJ_LAB_LOOP_ROOT;
  if (!loopEnv) {
    return { ok: findings.length === 0, findings, skipped_loop: true };
  }
  return { ok: findings.length === 0, findings };
}
