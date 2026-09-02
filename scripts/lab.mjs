#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  alphaPath,
  applyFamilyEnv,
  betaPath,
  controlEscapes,
  controlRoot,
  finding,
  git,
  gitToplevel,
  jjFlowRoot,
  labRootFromEnv,
  report,
  rmRetry,
  samePath,
  snapshotFileSet,
  underHome,
  wrap
} from './lib/lab-util.mjs';
import { seedFamilyGym } from './seed-family-gym.mjs';
import { checkVersionPin } from './oracles/version-pin.mjs';
import { checkAdaptShape, checkCopyFixture } from './oracles/copy-adapt.mjs';
import { checkPurposeMismatch, checkStaleMaster, originHasSharedDev } from './oracles/create-base.mjs';
import { checkHandoffReady } from './oracles/handoff-ready.mjs';
import { checkUnauthorizedTarget } from './oracles/unauthorized-target.mjs';
import { checkRoleLiterals } from './oracles/role-literals.mjs';
import { runDispatchOracles } from './oracles/dispatch-attest.mjs';

function parseArgs(argv) {
  const out = { cmd: argv[2] || 'oracle', suite: 'mechanical', lab: 'family-gym', json: false };
  for (let i = 3; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--suite') out.suite = argv[++i];
    else if (a === '--lab') out.lab = argv[++i];
  }
  return out;
}

function requireRoot() {
  const root = labRootFromEnv();
  if (!root) {
    const result = report(false, [finding(
      'LAB-ROOT',
      'JJ_LAB_FAMILY_ROOT missing or not an existing absolute directory',
      'export JJ_LAB_FAMILY_ROOT to this lab repo'
    )]);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(1);
  }
  return root;
}

function envPrint(root, productRoot) {
  const printed = applyFamilyEnv(root);
  const alpha = alphaPath(root);
  const cwd = alpha;
  printed.cwd = cwd;
  printed.git_toplevel = gitToplevel(cwd);
  printed.install_target = path.join(root, '_materialized', '.host');
  printed.start_branch = 'dev';
  printed.JJ_LAB_FAMILY_ROOT = root;
  printed.JJ_LAB_LOOP_ROOT = process.env.JJ_LAB_LOOP_ROOT || null;

  const stops = [];
  if (!process.env.JJ_LAB_FAMILY_ROOT) stops.push('JJ_LAB_FAMILY_ROOT missing');
  for (const key of ['JJ_GLOBAL_CONFIG_DIR', 'JJ_DISPATCH_CONTROL_ROOT', 'JJ_PORTFOLIO_ROOT']) {
    if (!process.env[key] || !path.isAbsolute(process.env[key])) stops.push(`${key} missing`);
  }
  const top = printed.git_toplevel;
  if (productRoot && top && samePath(top, productRoot)) stops.push('git_toplevel is product repo');
  if (top && samePath(top, root)) stops.push('git_toplevel is lab seed repo');
  if (top && samePath(top, wrap(root))) stops.push('git_toplevel is family-gym wrapper');
  if (top && samePath(top, controlRoot(root))) stops.push('git_toplevel is control');
  if (underHome(printed.control_root)) stops.push('control_root under homedir');
  if (path.basename(printed.control_root) !== 'control') stops.push('control basename != control');
  if (controlEscapes(wrap(root), printed.control_root)) stops.push('control_root escaped family-gym wrap');
  const ok = stops.length === 0;
  return { ok, status: ok ? 'PASS' : 'STOP', stops, ...printed };
}

async function runMechanical(root) {
  const findings = [];
  const homeDir = path.join(os.homedir(), '.jj-flow');
  const beforeHome = snapshotFileSet(homeDir);
  const pin = checkVersionPin(root);
  findings.push(...pin.findings);
  const flow = jjFlowRoot();
  if (!flow) {
    findings.push(finding('LAB-FLOW', 'JJ_FLOW_ROOT missing', 'lab-check must pass the product absolute root.'));
    return report(false, findings);
  }

  seedFamilyGym({ root });
  const envInfo = envPrint(root, flow);
  if (!envInfo.ok) {
    findings.push(finding('L2-ENV', `env-print STOP: ${envInfo.stops.join('; ')}`, 'Fix cwd/control_root.'));
    return report(false, findings, { env: envInfo });
  }

  const naming = JSON.parse(fs.readFileSync(path.join(controlRoot(root), 'config', 'naming.json'), 'utf8'));
  const plane0 = JSON.parse(fs.readFileSync(path.join(controlRoot(root), 'control-plane.json'), 'utf8'));
  findings.push(...checkRoleLiterals({ naming, plane: plane0 }).findings);

  const alpha = alphaPath(root);
  const beta = betaPath(root);
  git(alpha, ['checkout', 'dev']);
  git(beta, ['checkout', 'dev']);
  findings.push(...checkAdaptShape(beta).findings);
  findings.push(...checkCopyFixture(alpha, beta).findings);

  findings.push(...checkStaleMaster(beta).findings);
  findings.push(...checkPurposeMismatch(beta).findings);
  if (originHasSharedDev(path.join(wrap(root), 'origin.git'))) {
    findings.push(finding('L2-SEED', 'shared origin has refs/heads/dev', 'Do not push Vuex/Pinia overlay to origin/dev.'));
  }
  findings.push(...checkUnauthorizedTarget(root).findings);

  const ralph = await import(pathToFileURL(path.join(flow, 'src', 'ralph.mjs')).href);
  git(alpha, ['checkout', 'dev']);
  applyFamilyEnv(root);
  const dirtyId = typeof ralph.buildRalphRunId === 'function'
    ? ralph.buildRalphRunId('alphahand', '20260831')
    : 'task-alphahand';
  ralph.initRun({
    run_id: dirtyId,
    title: 'handoff dirty',
    goal: 'title persist',
    intensity: 'standard',
    attach_knowledge: false,
    project: 'notes-alpha'
  }, alpha);
  fs.appendFileSync(path.join(alpha, 'README.md'), '\ndirty\n');
  const dirtyPkg = ralph.writeHandoffPackage(dirtyId, {
    cwd: alpha,
    targets_hint: [{ role: 'notes-beta', repo: beta }],
    port_mode: 'FULL'
  });
  findings.push(...checkHandoffReady(dirtyPkg.handoff, { expectReady: false }).findings);
  git(alpha, ['checkout', '--', 'README.md']);

  const cleanId = typeof ralph.buildRalphRunId === 'function'
    ? ralph.buildRalphRunId('alphafull', '20260831')
    : 'task-alphafull';
  ralph.initRun({
    run_id: cleanId,
    title: 'handoff full',
    goal: 'title persist',
    intensity: 'standard',
    attach_knowledge: false,
    force: true
  }, alpha);
  ralph.setGate(cleanId, { gate: 'analyze', status: 'PASS', cwd: alpha });
  ralph.setGate(cleanId, { gate: 'plan', status: 'PASS', cwd: alpha });
  ralph.setGate(cleanId, { gate: 'deliver', status: 'PASS', cwd: alpha });
  ralph.setGate(cleanId, { gate: 'accept', status: 'PASS', cwd: alpha, force: true });
  git(alpha, ['add', '-A']);
  git(alpha, ['-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-m', 'chore: ralph accept for handoff']);
  const fullPkg = ralph.writeHandoffPackage(cleanId, {
    cwd: alpha,
    targets_hint: [{ role: 'notes-beta', repo: beta }],
    port_mode: 'FULL'
  });
  findings.push(...checkHandoffReady(fullPkg.handoff, { expectReady: true, expectMode: 'FULL' }).findings);

  const dispatch = await runDispatchOracles({ root, flow });
  findings.push(...dispatch.findings);

  const afterHome = snapshotFileSet(homeDir);
  const a = [...beforeHome].sort();
  const b = [...afterHome].sort();
  if (a.length !== b.length || a.some((item, i) => item !== b[i])) {
    findings.push(finding('L2-HOME', 'homedir .jj-flow file set changed', 'Keep control_root inside family-gym/control.'));
  }

  return report(findings.length === 0, findings, {
    lab: 'family-gym',
    pin: pin.manifest,
    JJ_LAB_FAMILY_ROOT: root
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const root = requireRoot();
  if (args.cmd === 'reset') {
    rmRetry(path.join(root, '_materialized'));
    process.stdout.write(`${JSON.stringify(report(true, [], { reset: true }), null, 2)}\n`);
    return;
  }
  if (args.cmd === 'seed') {
    seedFamilyGym({ root });
    process.stdout.write(`${JSON.stringify(report(true, [], { seeded: true }), null, 2)}\n`);
    return;
  }
  if (args.cmd === 'env-print') {
    if (!fs.existsSync(alphaPath(root))) seedFamilyGym({ root });
    const printed = envPrint(root, jjFlowRoot());
    process.stdout.write(`${JSON.stringify(printed, null, 2)}\n`);
    if (!printed.ok) process.exitCode = 1;
    return;
  }
  const result = await runMechanical(root);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
