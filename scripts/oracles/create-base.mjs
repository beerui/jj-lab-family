import { finding, git } from '../lib/lab-util.mjs';

export function checkStaleMaster(beta) {
  const findings = [];
  git(beta, ['checkout', 'master']);
  git(beta, ['fetch', 'origin']);
  const behind = Number(git(beta, ['rev-list', '--count', 'master..origin/master']));
  const ahead = Number(git(beta, ['rev-list', '--count', 'origin/master..master']));
  const master = git(beta, ['rev-parse', 'master']);
  const mergeBase = git(beta, ['merge-base', 'master', 'origin/master']);
  const porcelain = git(beta, ['status', '--porcelain']);
  if (behind < 2) findings.push(finding('L2-S4a', `behind=${behind} want >=2`, 'Fetch origin after seed bumps; do not merge local master.'));
  if (ahead !== 0) findings.push(finding('L2-S4a', `local master unique commits=${ahead}`, 'Overlays must not land on master.'));
  if (mergeBase !== master) findings.push(finding('L2-S4a', 'local master is not ancestor of origin/master', 'Keep master at C0.'));
  if (porcelain) findings.push(finding('L2-S4a', 'working tree dirty', 'S4a requires clean tree.'));
  const branches = git(beta, ['branch', '--format', '%(refname:short)']);
  if (!branches.split(/\r?\n/).includes('dev')) findings.push(finding('L2-S4a', 'dev branch missing', 'Seed local dev.'));
  return { ok: findings.length === 0, findings, behind, ahead };
}

export function checkPurposeMismatch(beta) {
  const findings = [];
  git(beta, ['checkout', 'feat/beta-0731-dev']);
  const current = git(beta, ['branch', '--show-current']);
  if (current !== 'feat/beta-0731-dev') {
    findings.push(finding('L2-S4b', `on ${current}`, 'start_branch must be feat/beta-0731-dev.'));
  }
  const mb = git(beta, ['merge-base', 'feat/beta-0731-dev', 'dev']);
  const dev = git(beta, ['rev-parse', 'dev']);
  try {
    git(beta, ['merge-base', '--is-ancestor', 'dev', 'feat/beta-0731-dev']);
  } catch {
    if (mb !== dev) findings.push(finding('L2-S4b', 'feat is not from local dev', 'Cut feat/beta-0731-dev from dev, not stale master.'));
  }
  const porcelain = git(beta, ['status', '--porcelain']);
  if (porcelain) findings.push(finding('L2-S4b', 'unexpected worktree diff', 'No title-persist business diff on this start_branch.'));
  return { ok: findings.length === 0, findings };
}

export function originHasSharedDev(origin) {
  try {
    const refs = git(origin, ['show-ref']);
    return /refs\/heads\/dev$/.test(refs.split(/\r?\n/).find((l) => /refs\/heads\/dev$/.test(l)) || '');
  } catch {
    return false;
  }
}
