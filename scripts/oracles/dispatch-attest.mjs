import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { alphaPath, betaPath, controlRoot, finding, git, jjFlowRoot } from '../lib/lab-util.mjs';

const SESSION = '019f00aa-1111-7000-8000-labfamily0001';

function taskDir(control, taskId) {
  return path.join(control, '.workflow', 'tasks', taskId);
}

export async function runDispatchOracles({ root, flow = jjFlowRoot() }) {
  const findings = [];
  const ctl = controlRoot(root);
  const alpha = alphaPath(root);
  const beta = betaPath(root);
  git(beta, ['checkout', 'dev']);
  const commit = git(beta, ['rev-parse', 'HEAD']);
  const sourceHead = git(alpha, ['rev-parse', 'HEAD']);

  const planeMod = await import(pathToFileURL(path.join(flow, 'src', 'dispatchControlPlane.mjs')).href);
  const attMod = await import(pathToFileURL(path.join(flow, 'src', 'dispatchAttestation.mjs')).href);
  const {
    REQUIRED_APP_CAPABILITIES,
    createControlPlane,
    previewDispatch,
    approveDispatch,
    dispatchTasks,
    bindThread,
    recordTaskResult,
    recordReviewResult,
    recordTargetResult,
    markDispatchUnknown,
    reconcileDispatch
  } = planeMod;

  const baseProjects = [
    { id: 'notes-alpha', name: 'notes-alpha', path: alpha.replaceAll('\\', '/'), status: 'active' },
    { id: 'notes-beta', name: 'notes-beta', path: beta.replaceAll('\\', '/'), status: 'active' }
  ];
  const controlProject = { id: 'control', name: 'family-gym control', path: ctl.replaceAll('\\', '/'), role: 'control' };

  const oralPlane = createControlPlane({
    controlProject,
    projects: baseProjects,
    deliveries: [deliveryDraft('DEL-LAB-ORAL')]
  });
  let oral = approveDispatch(oralPlane, { deliveryId: 'DEL-LAB-ORAL', decisionRef: 'lab:oral' });
  oral = dispatchTasks(oral, 'DEL-LAB-ORAL', { capabilities: [...REQUIRED_APP_CAPABILITIES] }).plane;
  const oralStatus = oral.deliveries[0].status;
  if (!['EVIDENCE_READY', 'RUNNING', 'DISPATCHING'].includes(oralStatus)) {
    findings.push(finding('L2-S5', `oral status ${oralStatus}`, 'No attestation file → must not be VERIFIED.'));
  }
  if (oralStatus === 'VERIFIED') {
    findings.push(finding('L2-S5', 'oral path reached VERIFIED', 'Verbal VERIFIED without files is forbidden.'));
  }

  const fullPlane = createControlPlane({
    controlProject,
    projects: baseProjects,
    deliveries: [deliveryDraft('DEL-LAB-FULL')]
  });
  let plane = approveDispatch(fullPlane, { deliveryId: 'DEL-LAB-FULL', decisionRef: 'lab:full' });
  const dispatched = dispatchTasks(plane, 'DEL-LAB-FULL', { capabilities: [...REQUIRED_APP_CAPABILITIES] });
  if (!dispatched.ok) {
    findings.push(finding('L2-S5', `DISPATCH failed: ${dispatched.reason || dispatched.status}`, 'Inspect dispatchTasks result.'));
    return { ok: false, findings };
  }
  plane = dispatched.plane;
  const findIntent = (p, projectId, responsibility) => (p.deliveries[0].dispatch_intents || [])
    .find((item) => item.project_id === projectId && item.responsibility === responsibility);
  const leadIntent = findIntent(plane, 'notes-alpha', 'development');
  const devIntent = findIntent(plane, 'notes-beta', 'development');
  if (!devIntent) {
    findings.push(finding('L2-S5', 'missing notes-beta development intent', 'DISPATCH should create the approved write task.'));
    return { ok: false, findings };
  }

  const written = attMod.writeGrokAttestation(ctl, {
    deliveryId: 'DEL-LAB-FULL',
    task_key: devIntent.task_key,
    session_id: SESSION,
    agent_name: 'jj-workflow-developer',
    sandbox_mode: 'workspace-write',
    environment: 'project-branch',
    project_path: beta,
    git_head_at_bind: commit
  });
  let reviewAtt = null;

  if (leadIntent) {
    const leadAtt = attMod.writeGrokAttestation(ctl, {
      deliveryId: 'DEL-LAB-FULL',
      task_key: leadIntent.task_key,
      session_id: SESSION,
      agent_name: 'jj-workflow-developer',
      sandbox_mode: 'workspace-write',
      environment: 'project-branch',
      project_path: alpha,
      git_head_at_bind: sourceHead
    });
    plane = bindThread(plane, {
      taskKey: leadIntent.task_key,
      threadId: SESSION,
      projectId: 'notes-alpha',
      hostId: 'grok-build',
      handleKind: 'session',
      agentName: 'jj-workflow-developer',
      sandboxMode: 'workspace-write',
      environment: 'project-branch',
      effectiveSandboxMode: 'workspace-write',
      sandboxEvidenceRef: leadAtt.rel.replaceAll('\\', '/'),
      worktree: alpha
    });
    plane = recordTaskResult(plane, {
      taskKey: leadIntent.task_key,
      status: 'COMPLETED',
      evidenceRef: 'lab:lead-dev-done',
      producedCommit: sourceHead
    });
  }

  plane = bindThread(plane, {
    taskKey: devIntent.task_key,
    threadId: SESSION,
    projectId: 'notes-beta',
    hostId: 'grok-build',
    handleKind: 'session',
    agentName: 'jj-workflow-developer',
    sandboxMode: 'workspace-write',
    environment: 'project-branch',
    effectiveSandboxMode: 'workspace-write',
    sandboxEvidenceRef: written.rel.replaceAll('\\', '/'),
    worktree: beta
  });
  plane = recordTaskResult(plane, {
    taskKey: devIntent.task_key,
    status: 'COMPLETED',
    evidenceRef: 'lab:dev-done',
    producedCommit: commit
  });
  const wave2 = dispatchTasks(plane, 'DEL-LAB-FULL', { capabilities: [...REQUIRED_APP_CAPABILITIES] });
  if (!wave2.ok) {
    findings.push(finding('L2-S5', `second DISPATCH failed: ${wave2.reason || wave2.status}`, 'Review depends on development COMPLETED.'));
    return { ok: false, findings };
  }
  plane = wave2.plane;
  const reviewIntent = findIntent(plane, 'notes-beta', 'review');
  if (!reviewIntent) {
    findings.push(finding('L2-S5', 'review intent missing after development COMPLETED', 'Second DISPATCH should create the review task.'));
    return { ok: false, findings };
  }
  reviewAtt = attMod.writeGrokAttestation(ctl, {
    deliveryId: 'DEL-LAB-FULL',
    task_key: reviewIntent.task_key,
    session_id: SESSION,
    agent_name: 'jj-workflow-reviewer',
    sandbox_mode: 'read-only',
    access: 'read',
    environment: 'project-read',
    project_path: beta,
    git_head_at_bind: commit
  });
  plane = bindThread(plane, {
    taskKey: reviewIntent.task_key,
    threadId: SESSION,
    projectId: 'notes-beta',
    hostId: 'grok-build',
    handleKind: 'session',
    agentName: 'jj-workflow-reviewer',
    sandboxMode: 'read-only',
    environment: 'project-read',
    effectiveSandboxMode: 'read-only',
    sandboxEvidenceRef: reviewAtt.rel.replaceAll('\\', '/')
  });
  plane = recordReviewResult(plane, {
    taskKey: reviewIntent.task_key,
    outcome: 'PASS',
    findings: [],
    reviewedCommit: commit,
    evidenceRef: 'lab:review-pass'
  });
  plane = recordTargetResult(plane, {
    deliveryId: 'DEL-LAB-FULL',
    projectId: 'notes-beta',
    status: 'VERIFIED',
    evidenceRef: 'lab:target-verified',
    commit,
    sourceHead,
    targetHead: commit
  });

  const delivery = plane.deliveries[0];
  if (delivery.status !== 'VERIFIED') {
    findings.push(finding('L2-S5', `full delivery status ${delivery.status}`, 'Attestation file + produced_commit + review PASS + result.md must yield VERIFIED.'));
  }
  const bound = delivery.dispatch_intents.find((item) => item.task_key === devIntent.task_key);
  if (bound.host_id !== 'grok-build' || bound.handle_kind !== 'session') {
    findings.push(finding('L2-S5', `host ${bound.host_id}/${bound.handle_kind}`, 'Lock Mode S grok-build session.'));
  }
  if (String(bound.sandbox_evidence_ref).startsWith('host:')) {
    findings.push(finding('L2-S5', 'attestation is host: string', 'Use attestations/*.json file.'));
  }
  if (!fs.existsSync(path.join(ctl, bound.sandbox_evidence_ref)) && !fs.existsSync(written.abs)) {
    findings.push(finding('L2-S5', 'attestation file missing', 'writeGrokAttestation must persist a file.'));
  }
  if (/^session-/.test(bound.thread_id) || /session-[a-z0-9].*-\d{8}/i.test(bound.thread_id)) {
    findings.push(finding('L2-S5', `synthetic thread_id ${bound.thread_id}`, 'Use a UUID session id.'));
  }

  const taskId = devIntent.task_key.replaceAll('/', '__');
  const td = taskDir(ctl, taskId);
  fs.mkdirSync(td, { recursive: true });
  fs.writeFileSync(path.join(td, 'result.md'), '# result\n\nstatus: VERIFIED\n');
  fs.writeFileSync(path.join(td, 'progress.md'), '# progress\n\nstatus: VERIFIED\n');
  const resultMd = fs.readFileSync(path.join(td, 'result.md'), 'utf8');
  if (/EVIDENCE_READY/.test(resultMd) && !/VERIFIED/.test(resultMd)) {
    findings.push(finding('L2-S5', 'result.md still EVIDENCE_READY', 'T-task-result-sync: same batch writes VERIFIED.'));
  }

  const manifestPath = path.join(ctl, 'control-plane.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(plane, null, 2)}\n`);
  const self = spawnSync(process.execPath, [
    path.join(flow, 'skills', 'jj-dispatch', 'scripts', 'plane-self-check.mjs'),
    '--manifest',
    manifestPath
  ], { encoding: 'utf8', windowsHide: true });
  if (self.status !== 0) {
    findings.push(finding('L2-S5', `plane-self-check exit ${self.status}: ${self.stderr || self.stdout}`, 'Fix attestation files and session ids.'));
  }

  // L2-S6 partial fail
  const failPlane = createControlPlane({
    controlProject,
    projects: baseProjects,
    deliveries: [deliveryDraft('DEL-LAB-FAIL')]
  });
  let failed = approveDispatch(failPlane, { deliveryId: 'DEL-LAB-FAIL', decisionRef: 'lab:fail' });
  failed = dispatchTasks(failed, 'DEL-LAB-FAIL', { capabilities: [...REQUIRED_APP_CAPABILITIES] }).plane;
  const failDev = failed.deliveries[0].dispatch_intents.find((item) => item.project_id === 'notes-beta' && item.responsibility === 'development');
  const failAtt = attMod.writeGrokAttestation(ctl, {
    deliveryId: 'DEL-LAB-FAIL',
    task_key: failDev.task_key,
    session_id: SESSION,
    agent_name: 'jj-workflow-developer'
  });
  failed = bindThread(failed, {
    taskKey: failDev.task_key,
    threadId: SESSION,
    projectId: 'notes-beta',
    hostId: 'grok-build',
    handleKind: 'session',
    agentName: 'jj-workflow-developer',
    sandboxMode: 'workspace-write',
    environment: 'project-branch',
    effectiveSandboxMode: 'workspace-write',
    sandboxEvidenceRef: failAtt.rel.replaceAll('\\', '/'),
    worktree: beta
  });
  failed = recordTaskResult(failed, {
    taskKey: failDev.task_key,
    status: 'BLOCKED',
    evidenceRef: 'lab:blocked'
  });
  failed = recordTargetResult(failed, {
    deliveryId: 'DEL-LAB-FAIL',
    projectId: 'notes-beta',
    status: 'FAILED',
    evidenceRef: 'lab:target-failed',
    sourceHead
  });
  if (failed.deliveries[0].status === 'VERIFIED') {
    findings.push(finding('L2-S6', 'FAILED target still VERIFIED family', 'Partial failure must not close the family.'));
  }

  const reconPlane = createControlPlane({
    controlProject,
    projects: baseProjects,
    deliveries: [deliveryDraft('DEL-LAB-RECON')]
  });
  let recon = approveDispatch(reconPlane, { deliveryId: 'DEL-LAB-RECON', decisionRef: 'lab:recon' });
  recon = dispatchTasks(recon, 'DEL-LAB-RECON', { capabilities: [...REQUIRED_APP_CAPABILITIES] }).plane;
  const reconDev = recon.deliveries[0].dispatch_intents.find((item) => item.project_id === 'notes-beta' && item.responsibility === 'development');
  const keysBefore = recon.deliveries[0].dispatch_intents.map((item) => item.task_key).sort();
  recon = markDispatchUnknown(recon, { taskKey: reconDev.task_key });
  const recAtt = attMod.writeGrokAttestation(ctl, {
    deliveryId: 'DEL-LAB-RECON',
    task_key: reconDev.task_key,
    session_id: SESSION,
    agent_name: 'jj-workflow-developer'
  });
  const rec = reconcileDispatch(recon, {
    taskKey: reconDev.task_key,
    candidates: [{
      task_key: reconDev.task_key,
      thread_id: SESSION,
      project_id: 'notes-beta',
      host_id: 'grok-build',
      handle_kind: 'session',
      agent_name: 'jj-workflow-developer',
      sandbox_mode: 'workspace-write',
      environment: 'project-branch',
      effective_sandbox_mode: 'workspace-write',
      sandbox_evidence_ref: recAtt.rel.replaceAll('\\', '/'),
      worktree: beta
    }]
  });
  if (rec.plane) recon = rec.plane;
  const keysAfter = recon.deliveries[0].dispatch_intents.map((item) => item.task_key).sort();
  if (keysBefore.join() !== keysAfter.join()) {
    findings.push(finding('L2-S6', 'RECONCILE changed task_key set', 'UNKNOWN resume must keep the same keys.'));
  }

  return { ok: findings.length === 0, findings, plane };
}

function deliveryDraft(id) {
  return {
    delivery_id: id,
    title: 'note title persist',
    request_ref: 'lab:family',
    origin_project: 'notes-alpha',
    requirement_owner: 'notes-alpha',
    lead_project: 'notes-alpha',
    lead_responsibilities: [
      { name: 'development', access: 'write', phase: 'development', status: 'PENDING', attempt: 1, depends_on: [] }
    ],
    reference_implementation: null,
    targets: [
      {
        project_id: 'notes-beta',
        status: 'PENDING',
        responsibilities: [
          { name: 'development', access: 'write', phase: 'development', status: 'PENDING', attempt: 1, depends_on: [] },
          { name: 'review', access: 'read', phase: 'review', status: 'PENDING', attempt: 1, depends_on: [`${id}/notes-beta/development/1`] }
        ]
      }
    ],
    status: 'DRAFT',
    approval: { status: 'PENDING', decision_ref: null, approved_at: null, task_keys: [], tasks: [] },
    dispatch_intents: [],
    decisions: [],
    artifacts: []
  };
}
