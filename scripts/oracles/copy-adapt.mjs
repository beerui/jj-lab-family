import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../lib/lab-util.mjs';

export function detectIsomorphicCopy(alpha, beta) {
  const dest = path.join(beta, 'src', 'store', 'notes.js');
  if (fs.existsSync(dest)) {
    const text = fs.readFileSync(dest, 'utf8');
    if (/mutations\s*:/.test(text) || fs.existsSync(path.join(alpha, 'src', 'store', 'notes.js'))
      && fs.readFileSync(path.join(alpha, 'src', 'store', 'notes.js'), 'utf8') === text) {
      return true;
    }
  }
  return false;
}

export function checkAdaptShape(beta) {
  const findings = [];
  if (fs.existsSync(path.join(beta, 'src', 'store', 'notes.js'))) {
    findings.push(finding('L2-S1', 'notes-beta has src/store/notes.js', 'ADAPT into composables/useNotes.js; do not copy Vuex store.'));
  }
  const composable = path.join(beta, 'src', 'composables', 'useNotes.js');
  if (!fs.existsSync(composable)) {
    findings.push(finding('L2-S1', 'missing useNotes.js', 'Pinia-shaped composable must exist on dev.'));
  } else {
    const text = fs.readFileSync(composable, 'utf8');
    if (/mutations\s*:/.test(text)) {
      findings.push(finding('L2-S1', 'useNotes.js still has mutations: signature', 'ADAPT must not keep Vuex mutations.'));
    }
  }
  const tests = path.join(beta, 'tests', 'useNotes.test.mjs');
  const testText = fs.existsSync(tests) ? fs.readFileSync(tests, 'utf8') : '';
  if (!/REQ-L1-001/.test(testText) && !/saveTitle/.test(testText)) {
    findings.push(finding('L2-S1', 'useNotes tests missing title persist assertion', 'Keep REQ-L1-001 or equivalent.'));
  }
  if (fs.existsSync(path.join(beta, '.workflow', 'jj-same'))) {
    findings.push(finding('L2-S1', '.workflow/jj-same/ exists', 'same artifacts do not use that path.'));
  }
  return { ok: findings.length === 0, findings };
}

export function checkCopyFixture(alpha, beta) {
  const destDir = path.join(beta, 'src', 'store');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(path.join(alpha, 'src', 'store', 'notes.js'), path.join(destDir, 'notes.js'));
  const copied = detectIsomorphicCopy(alpha, beta);
  fs.rmSync(path.join(destDir, 'notes.js'), { force: true });
  try { fs.rmdirSync(destDir); } catch { /* keep if not empty */ }
  if (!copied) {
    return {
      ok: false,
      findings: [finding('L2-S2', 'detectIsomorphicCopy was false after copy fixture', 'Copy of store/notes.js must be detected.')]
    };
  }
  return { ok: true, findings: [], detectIsomorphicCopy: true };
}
