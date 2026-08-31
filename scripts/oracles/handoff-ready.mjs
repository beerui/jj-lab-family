import { finding } from '../lib/lab-util.mjs';

export function checkHandoffReady(handoff, { expectReady, expectMode } = {}) {
  const findings = [];
  if (expectReady === false && handoff.ready !== false) {
    findings.push(finding('L2-S3a', `ready=${handoff.ready}`, 'Dirty tree or missing accept must set ready=false.'));
  }
  if (expectReady === false) {
    const reasons = handoff.blocked_reasons || [];
    const okReason = reasons.includes('commit_stable=false')
      || reasons.includes('source_head_missing')
      || reasons.includes('accept!=PASS');
    if (!okReason) {
      findings.push(finding('L2-S3a', `blocked_reasons=${JSON.stringify(reasons)}`, 'Expect commit_stable=false, source_head_missing, or accept!=PASS.'));
    }
  }
  if (expectMode && handoff.mode !== expectMode) {
    findings.push(finding('L2-S1', `mode=${handoff.mode} expected ${expectMode}`, 'Call writeHandoffPackage with port_mode FULL.'));
  }
  return { ok: findings.length === 0, findings };
}
