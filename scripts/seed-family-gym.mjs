import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  alphaPath,
  applyFamilyEnv,
  betaPath,
  configureRepo,
  controlRoot,
  copyTree,
  git,
  labRootFromEnv,
  mkdtemp,
  originPath,
  rmRetry,
  wrap
} from './lib/lab-util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');

function overlay(src, dest) {
  copyTree(src, dest);
}

export function seedFamilyGym({ root = labRootFromEnv() || defaultRoot } = {}) {
  const mat = wrap(root);
  rmRetry(path.join(root, '_materialized'));
  fs.mkdirSync(mat, { recursive: true });

  const origin = originPath(root);
  fs.mkdirSync(origin, { recursive: true });
  git(origin, ['init', '--bare', '--initial-branch=master']);

  const c0 = mkdtemp('jj-lab-family-c0-');
  fs.rmSync(c0, { recursive: true, force: true });
  git(os.tmpdir(), ['clone', origin.replaceAll('\\', '/'), c0]);
  overlay(path.join(root, 'seed', 'shared-origin'), c0);
  configureRepo(c0);
  git(c0, ['add', '-A']);
  git(c0, ['-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-m', 'chore: shared origin C0']);
  git(c0, ['push', 'origin', 'master']);

  const alpha = alphaPath(root);
  const beta = betaPath(root);
  git(mat, ['clone', origin.replaceAll('\\', '/'), alpha]);
  git(mat, ['clone', origin.replaceAll('\\', '/'), beta]);
  configureRepo(alpha);
  configureRepo(beta);

  git(alpha, ['checkout', '-b', 'dev']);
  overlay(path.join(root, 'seed', 'notes-alpha'), alpha);
  git(alpha, ['add', '-A']);
  git(alpha, ['-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-m', 'feat: vuex-shaped notes store']);

  git(beta, ['checkout', '-b', 'dev']);
  overlay(path.join(root, 'seed', 'notes-beta'), beta);
  git(beta, ['add', '-A']);
  git(beta, ['-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-m', 'feat: pinia-shaped notes store']);
  git(beta, ['checkout', '-b', 'feat/beta-0731-dev']);

  git(alpha, ['checkout', 'master']);
  git(beta, ['checkout', 'master']);

  const bumper = mkdtemp('jj-lab-family-bump-');
  fs.rmSync(bumper, { recursive: true, force: true });
  git(os.tmpdir(), ['clone', origin.replaceAll('\\', '/'), bumper]);
  configureRepo(bumper);
  for (const n of [1, 2]) {
    fs.appendFileSync(path.join(bumper, 'README.md'), `\nbump ${n}\n`);
    git(bumper, ['add', 'README.md']);
    git(bumper, ['-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-m', `docs: origin master bump ${n}`]);
  }
  git(bumper, ['push', 'origin', 'master']);
  git(alpha, ['fetch', 'origin']);
  git(beta, ['fetch', 'origin']);

  const ctl = controlRoot(root);
  copyTree(path.join(root, 'control-template'), ctl);
  fs.mkdirSync(path.join(ctl, 'config'), { recursive: true });
  fs.copyFileSync(path.join(root, 'map.md'), path.join(ctl, 'config', 'map.md'));
  const naming = {
    schema_version: 'jj-flow/naming/1.0',
    dispatch: {
      control_root: ctl.replaceAll('\\', '/'),
      portfolio_root: mat.replaceAll('\\', '/')
    }
  };
  fs.writeFileSync(path.join(ctl, 'config', 'naming.json'), `${JSON.stringify(naming, null, 2)}\n`);
  fs.writeFileSync(
    path.join(ctl, 'control-plane.json'),
    `${JSON.stringify({
      schema_version: 'jj-flow/control-plane/1.0',
      revision: 0,
      control_project: { id: 'control', name: 'family-gym control', path: ctl.replaceAll('\\', '/'), role: 'control' },
      projects: [
        { id: 'notes-alpha', name: 'notes-alpha', path: alpha.replaceAll('\\', '/'), status: 'active' },
        { id: 'notes-beta', name: 'notes-beta', path: beta.replaceAll('\\', '/'), status: 'active' }
      ],
      deliveries: [],
      events: []
    }, null, 2)}\n`
  );

  try { fs.rmSync(c0, { recursive: true, force: true }); } catch { /* tmp */ }
  try { fs.rmSync(bumper, { recursive: true, force: true }); } catch { /* tmp */ }

  applyFamilyEnv(root);
  return { root, alpha, beta, origin, control: ctl };
}

const isDirect = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirect) {
  seedFamilyGym();
  process.stdout.write('seeded family-gym\n');
}
void os;
