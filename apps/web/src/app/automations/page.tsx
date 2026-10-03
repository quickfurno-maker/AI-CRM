'use client';

import Link from 'next/link';
import { WorkspaceLoading } from '@/components/workspace-states';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Workflow = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  status: string;
  workspaceId: string;
  updatedAt: string;
};

type Version = {
  id: string;
  workflowId: string;
  version: number;
  status: string;
  triggerType: 'EVENT' | 'MANUAL';
  triggerConfig: Record<string, unknown>;
  startNodeKey?: string | null;
  maxSteps: number;
};

type GraphNode = {
  id: string;
  nodeKey: string;
  nodeType: 'ACTION' | 'CONDITION' | 'WAIT' | 'APPROVAL' | 'END';
  name: string;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
};

type GraphEdge = {
  id: string;
  edgeKey: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  branchKey: string;
  priority: number;
  config?: Record<string, unknown> | null;
};

type Graph = {
  version: Version;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type Run = {
  id: string;
  workflowId: string;
  workflowVersionId: string;
  status: string;
  triggerType: string;
  triggerEventType?: string | null;
  currentNodeKey?: string | null;
  wakeAt?: string | null;
  stepsExecuted: number;
  lastError?: string | null;
  startedAt: string;
  completedAt?: string | null;
};

type StepRun = {
  id: string;
  runId: string;
  nodeKey: string;
  nodeType: string;
  attempt: number;
  status: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  wakeAt?: string | null;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
};

type RunDetail = {
  run: Run;
  steps: StepRun[];
};

type Approval = {
  id: string;
  runId: string;
  status: string;
  title: string;
  description?: string | null;
  requestedAt: string;
  expiresAt?: string | null;
};

type CanvasData = {
  label: string;
  nodeKey: string;
  nodeType: GraphNode['nodeType'];
  config: Record<string, unknown>;
};

type Tab = 'builder' | 'runs' | 'approvals';

const field =
  'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-violet-400/50';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/automation/' + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : body.message;
    throw new Error(message ?? 'Request failed.');
  }
  return body;
}

function defaultConfig(type: GraphNode['nodeType']) {
  if (type === 'ACTION') {
    return {
      action: 'CRM_CREATE_TASK',
      input: { title: 'Automation follow-up task' },
    };
  }
  if (type === 'CONDITION') {
    return {
      path: 'event.payload.status',
      operator: 'EQUALS',
      value: 'QUALIFIED',
    };
  }
  if (type === 'WAIT') return { durationSeconds: 300 };
  if (type === 'APPROVAL') {
    return {
      title: 'Approve automation action',
      description: 'Review before continuing.',
      expirySeconds: 86400,
    };
  }
  return {};
}

function toCanvasNode(node: GraphNode): Node<CanvasData> {
  return {
    id: node.nodeKey,
    position: { x: node.positionX, y: node.positionY },
    data: {
      label: node.name,
      nodeKey: node.nodeKey,
      nodeType: node.nodeType,
      config: node.config,
    },
    type: 'default',
  };
}

function toCanvasEdge(edge: GraphEdge): Edge {
  return {
    id: edge.edgeKey,
    source: edge.sourceNodeKey,
    target: edge.targetNodeKey,
    label: edge.branchKey,
    data: {
      branchKey: edge.branchKey,
      priority: edge.priority,
      config: edge.config ?? {},
    },
    animated: edge.branchKey !== 'DEFAULT',
  };
}

export default function AutomationsPage() {
  const [tab, setTab] = useState<Tab>('builder');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>();
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [nodes, setNodes] = useState<Node<CanvasData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [startNodeKey, setStartNodeKey] = useState('');
  const [configText, setConfigText] = useState('{}');
  const [edgeBranch, setEdgeBranch] = useState('DEFAULT');
  const [edgePriority, setEdgePriority] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [runDetail, setRunDetail] = useState<RunDetail>();
  const [versionComparison, setVersionComparison] = useState<{
    baseVersion: number;
    targetVersion: number;
    addedNodes: string[];
    removedNodes: string[];
    changedNodes: string[];
    addedEdges: string[];
    removedEdges: string[];
    changedEdges: string[];
  }>();

  const selectedWorkflow = workflows.find(
    (item) => item.id === selectedWorkflowId,
  );
  const selectedVersion = versions.find(
    (item) => item.id === selectedVersionId,
  );
  const selectedNode = nodes.find((item) => item.id === selectedNodeId);
  const selectedEdge = edges.find((item) => item.id === selectedEdgeId);

  const loadOverview = useCallback(async () => {
    try {
      const [workflowRows, runRows, approvalRows] = await Promise.all([
        api<Workflow[]>('workflows'),
        api<Run[]>('runs?limit=100'),
        api<Approval[]>('approvals'),
      ]);
      setWorkflows(workflowRows);
      setRuns(runRows);
      setApprovals(approvalRows);
      setSelectedWorkflowId((current) =>
        current && workflowRows.some((item) => item.id === current)
          ? current
          : workflowRows[0]?.id,
      );
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to load automation control plane.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);
  const loadVersions = useCallback(async (workflowId: string) => {
    const rows = await api<Version[]>(
      'workflows/' + workflowId + '/versions',
    );
    setVersions(rows);
    setSelectedVersionId((current) => {
      if (current && rows.some((item) => item.id === current)) return current;
      return rows.find((item) => item.status === 'DRAFT')?.id ??
        rows.find((item) => item.status === 'ACTIVE')?.id ??
        rows[0]?.id;
    });
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    const timer = window.setTimeout(() => {
      void loadVersions(selectedWorkflowId).catch((reason: Error) =>
        setError(reason.message),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadVersions, selectedWorkflowId]);

  const loadGraph = useCallback(
    async (workflowId: string, versionId: string) => {
      const graph = await api<Graph>(
        'workflows/' +
          workflowId +
          '/versions/' +
          versionId +
          '/graph',
      );
      setNodes(graph.nodes.map(toCanvasNode));
      setEdges(graph.edges.map(toCanvasEdge));
      setStartNodeKey(graph.version.startNodeKey ?? '');
      setSelectedNodeId(undefined);
      setSelectedEdgeId(undefined);
    },
    [],
  );

  useEffect(() => {
    if (!selectedWorkflowId || !selectedVersionId) return;
    const timer = window.setTimeout(() => {
      void loadGraph(selectedWorkflowId, selectedVersionId).catch(
        (reason: Error) => setError(reason.message),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadGraph, selectedVersionId, selectedWorkflowId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(
      (current) =>
        applyNodeChanges(changes, current) as Node<CanvasData>[],
    );
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const id =
      'edge_' +
      connection.source +
      '_' +
      connection.target +
      '_' +
      Date.now();
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id,
          label: 'DEFAULT',
          data: { branchKey: 'DEFAULT', priority: 0, config: {} },
        },
        current,
      ),
    );
  }, []);

  async function createWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const triggerType = String(form.get('triggerType') ?? 'EVENT');
    const eventType = String(
      form.get('eventType') ?? 'crm.lead.created.v1',
    ).trim();

    setBusy(true);
    try {
      const created = await api<{ workflow: Workflow; version: Version }>(
        'workflows',
        {
          method: 'POST',
          body: JSON.stringify({
            name: form.get('name'),
            key: form.get('key'),
            description: form.get('description') || undefined,
            triggerType,
            triggerConfig:
              triggerType === 'EVENT'
                ? { eventTypes: [eventType] }
                : {},
          }),
        },
      );
      element.reset();
      await loadOverview();
      setSelectedWorkflowId(created.workflow.id);
      setSelectedVersionId(created.version.id);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to create workflow.',
      );
    } finally {
      setBusy(false);
    }
  }

  function addNode(type: GraphNode['nodeType']) {
    const count = nodes.filter(
      (item) => item.data.nodeType === type,
    ).length;
    const key = (type.toLowerCase() + '_' + (count + 1)).replace(
      /[^a-z0-9_-]/g,
      '_',
    );
    const label =
      type.charAt(0) + type.slice(1).toLowerCase() + ' ' + (count + 1);
    const node: Node<CanvasData> = {
      id: key,
      position: {
        x: 120 + (nodes.length % 3) * 260,
        y: 120 + Math.floor(nodes.length / 3) * 150,
      },
      data: {
        label,
        nodeKey: key,
        nodeType: type,
        config: defaultConfig(type),
      },
    };
    setNodes((current) => [...current, node]);
    if (!startNodeKey) setStartNodeKey(key);
    setSelectedNodeId(key);
    setSelectedEdgeId(undefined);
  }

  function updateNodeConfig() {
    if (!selectedNodeId) return;
    try {
      const parsed = JSON.parse(configText) as Record<string, unknown>;
      setNodes((current) =>
        current.map((item) =>
          item.id === selectedNodeId
            ? { ...item, data: { ...item.data, config: parsed } }
            : item,
        ),
      );
      setError('');
    } catch {
      setError('Node config must be valid JSON.');
    }
  }

  function updateNodeName(name: string) {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((item) =>
        item.id === selectedNodeId
          ? { ...item, data: { ...item.data, label: name } }
          : item,
      ),
    );
  }

  function updateSelectedNodeConfig(config: Record<string, unknown>) {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((item) =>
        item.id === selectedNodeId
          ? { ...item, data: { ...item.data, config } }
          : item,
      ),
    );
    setConfigText(JSON.stringify(config, null, 2));
  }
  function updateEdge() {
    if (!selectedEdgeId) return;
    const priority = Number.parseInt(edgePriority || '0', 10);
    setEdges((current) =>
      current.map((item) =>
        item.id === selectedEdgeId
          ? {
              ...item,
              label: edgeBranch,
              data: {
                ...(item.data ?? {}),
                branchKey: edgeBranch,
                priority: Number.isFinite(priority) ? priority : 0,
              },
              animated: edgeBranch !== 'DEFAULT',
            }
          : item,
      ),
    );
  }

  async function saveGraph() {
    if (!selectedWorkflowId || !selectedVersionId) return;
    setBusy(true);
    try {
      const payload = {
        startNodeKey,
        nodes: nodes.map((item) => ({
          nodeKey: item.id,
          nodeType: item.data.nodeType,
          name: item.data.label,
          config: item.data.config ?? {},
          positionX: Math.round(item.position.x),
          positionY: Math.round(item.position.y),
        })),
        edges: edges.map((item, index) => {
          const data = (item.data ?? {}) as Record<string, unknown>;
          return {
            edgeKey: item.id || 'edge_' + index,
            sourceNodeKey: item.source,
            targetNodeKey: item.target,
            branchKey:
              typeof data.branchKey === 'string'
                ? data.branchKey
                : typeof item.label === 'string'
                  ? item.label
                  : 'DEFAULT',
            priority: Number(data.priority ?? 0),
            config:
              data.config &&
              typeof data.config === 'object' &&
              !Array.isArray(data.config)
                ? data.config
                : {},
          };
        }),
      };

      await api(
        'workflows/' +
          selectedWorkflowId +
          '/versions/' +
          selectedVersionId +
          '/graph',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      );
      await loadGraph(selectedWorkflowId, selectedVersionId);
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to save graph.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function activateVersion() {
    if (!selectedWorkflowId || !selectedVersionId) return;
    setBusy(true);
    try {
      await saveGraph();
      await api(
        'workflows/' +
          selectedWorkflowId +
          '/versions/' +
          selectedVersionId +
          '/activate',
        { method: 'POST' },
      );
      await Promise.all([
        loadVersions(selectedWorkflowId),
        loadOverview(),
      ]);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Activation failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createVersion() {
    if (!selectedWorkflowId || !selectedVersion) return;
    setBusy(true);
    try {
      const version = await api<Version>(
        'workflows/' + selectedWorkflowId + '/versions',
        {
          method: 'POST',
          body: JSON.stringify({
            triggerType: selectedVersion.triggerType,
            triggerConfig: selectedVersion.triggerConfig,
            maxSteps: selectedVersion.maxSteps,
          }),
        },
      );
      await loadVersions(selectedWorkflowId);
      setSelectedVersionId(version.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to create workflow version.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function comparePreviousVersion() {
    if (!selectedWorkflowId || !selectedVersion) return;
    const previous = versions
      .filter((item) => item.version < selectedVersion.version)
      .sort((a, b) => b.version - a.version)[0];

    if (!previous) {
      setError('There is no earlier workflow version to compare.');
      setVersionComparison(undefined);
      return;
    }

    setBusy(true);
    try {
      const [base, target] = await Promise.all([
        api<Graph>(
          'workflows/' +
            selectedWorkflowId +
            '/versions/' +
            previous.id +
            '/graph',
        ),
        api<Graph>(
          'workflows/' +
            selectedWorkflowId +
            '/versions/' +
            selectedVersion.id +
            '/graph',
        ),
      ]);

      const baseNodes = new Map(
        base.nodes.map((node) => [node.nodeKey, node]),
      );
      const targetNodes = new Map(
        target.nodes.map((node) => [node.nodeKey, node]),
      );
      const baseEdges = new Map(
        base.edges.map((edge) => [edge.edgeKey, edge]),
      );
      const targetEdges = new Map(
        target.edges.map((edge) => [edge.edgeKey, edge]),
      );

      const addedNodes = [...targetNodes.keys()].filter(
        (key) => !baseNodes.has(key),
      );
      const removedNodes = [...baseNodes.keys()].filter(
        (key) => !targetNodes.has(key),
      );
      const changedNodes = [...targetNodes.keys()].filter((key) => {
        const before = baseNodes.get(key);
        const after = targetNodes.get(key);
        if (!before || !after) return false;
        return (
          before.nodeType !== after.nodeType ||
          before.name !== after.name ||
          JSON.stringify(before.config) !== JSON.stringify(after.config)
        );
      });

      const addedEdges = [...targetEdges.keys()].filter(
        (key) => !baseEdges.has(key),
      );
      const removedEdges = [...baseEdges.keys()].filter(
        (key) => !targetEdges.has(key),
      );
      const changedEdges = [...targetEdges.keys()].filter((key) => {
        const before = baseEdges.get(key);
        const after = targetEdges.get(key);
        if (!before || !after) return false;
        return (
          before.sourceNodeKey !== after.sourceNodeKey ||
          before.targetNodeKey !== after.targetNodeKey ||
          before.branchKey !== after.branchKey ||
          before.priority !== after.priority ||
          JSON.stringify(before.config ?? {}) !==
            JSON.stringify(after.config ?? {})
        );
      });

      setVersionComparison({
        baseVersion: previous.version,
        targetVersion: selectedVersion.version,
        addedNodes,
        removedNodes,
        changedNodes,
        addedEdges,
        removedEdges,
        changedEdges,
      });
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to compare workflow versions.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function triggerManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkflowId) return;
    const form = new FormData(event.currentTarget);
    const raw = String(form.get('context') ?? '{}');
    setBusy(true);
    try {
      const context = JSON.parse(raw) as Record<string, unknown>;
      await api('workflows/' + selectedWorkflowId + '/trigger', {
        method: 'POST',
        body: JSON.stringify({ context }),
      });
      setRuns(await api<Run[]>('runs?limit=100'));
      setTab('runs');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Manual run failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideApproval(
    id: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    setBusy(true);
    try {
      await api('approvals/' + id + '/decision', {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      const [approvalRows, runRows] = await Promise.all([
        api<Approval[]>('approvals'),
        api<Run[]>('runs?limit=100'),
      ]);
      setApprovals(approvalRows);
      setRuns(runRows);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Approval decision failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadRunDetail(id: string) {
    try {
      const detail = await api<RunDetail>('runs/' + id);
      setRunDetail(detail);
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to load run trace.',
      );
    }
  }

  async function runControl(
    runId: string,
    action:
      | 'pause'
      | 'resume-paused'
      | 'cancel'
      | 'reconcile-retry'
      | 'reconcile-cancel',
  ) {
    setBusy(true);
    try {
      if (action === 'pause') {
        await api('runs/' + runId + '/pause', {
          method: 'POST',
          body: JSON.stringify({ reason: 'Paused from Automation Control Center.' }),
        });
      } else if (action === 'resume-paused') {
        await api('runs/' + runId + '/resume-paused', {
          method: 'POST',
        });
      } else if (action === 'cancel') {
        await api('runs/' + runId + '/cancel', {
          method: 'POST',
          body: JSON.stringify({ reason: 'Cancelled from Automation Control Center.' }),
        });
      } else if (action === 'reconcile-retry') {
        await api('runs/' + runId + '/reconcile', {
          method: 'POST',
          body: JSON.stringify({
            action: 'RETRY',
            reason:
              'Operator confirmed the previous attempt produced no external side effect.',
            confirmedNoSideEffect: true,
          }),
        });
      } else {
        await api('runs/' + runId + '/reconcile', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CANCEL',
            reason: 'Operator cancelled after reconciliation.',
          }),
        });
      }

      const [runRows, approvalRows, detail] = await Promise.all([
        api<Run[]>('runs?limit=100'),
        api<Approval[]>('approvals'),
        api<RunDetail>('runs/' + runId),
      ]);
      setRuns(runRows);
      setApprovals(approvalRows);
      setRunDetail(detail);
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Run control failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  function openRunOnCanvas(detail: RunDetail) {
    setSelectedWorkflowId(detail.run.workflowId);
    setSelectedVersionId(detail.run.workflowVersionId);
    setTab('builder');
  }

  const tracedCompletedNodeKeys = useMemo(
    () =>
      new Set(
        (runDetail?.steps ?? [])
          .filter((step) => step.status === 'COMPLETED')
          .map((step) => step.nodeKey),
      ),
    [runDetail],
  );

  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const isCurrent =
          runDetail?.run.workflowVersionId === selectedVersionId &&
          runDetail?.run.currentNodeKey === node.id;
        const isCompleted =
          runDetail?.run.workflowVersionId === selectedVersionId &&
          tracedCompletedNodeKeys.has(node.id);
        return {
          ...node,
          style: isCurrent
            ? {
                border: '2px solid rgb(167 139 250)',
                boxShadow: '0 0 0 5px rgb(167 139 250 / 0.12)',
                background: 'rgb(24 24 27)',
                color: 'white',
              }
            : isCompleted
              ? {
                  border: '1px solid rgb(52 211 153 / 0.75)',
                  background: 'rgb(24 24 27)',
                  color: 'white',
                }
              : {
                  border: '1px solid rgb(255 255 255 / 0.12)',
                  background: 'rgb(24 24 27)',
                  color: 'white',
                },
        };
      }),
    [nodes, runDetail, selectedVersionId, tracedCompletedNodeKeys],
  );

  const metrics = useMemo(
    () => ({
      workflows: workflows.length,
      active: workflows.filter((item) => item.status === 'ACTIVE').length,
      waiting: runs.filter((item) =>
        ['WAITING', 'WAITING_APPROVAL', 'ACTION_REQUIRED'].includes(
          item.status,
        ),
      ).length,
      approvals: approvals.filter((item) => item.status === 'PENDING').length,
    }),
    [approvals, runs, workflows],
  );
  if (loading) {
    return <WorkspaceLoading label="Automation Control Plane" />;
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-[2000px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0b0e14] p-5 lg:block">
          <div className="mb-8 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              Business OS
            </div>
            <div className="mt-2 text-lg font-semibold">
              Automation Control
            </div>
          </div>
          <nav className="space-y-1 text-sm">
            <Link
              href="/dashboard"
              className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5"
            >
              Command Center
            </Link>
            <Link
              href="/crm"
              className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5"
            >
              CRM
            </Link>
            <Link
              href="/whatsapp"
              className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5"
            >
              WhatsApp
            </Link>
            <Link
              href="/ai-agents"
              className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5"
            >
              AI Agents
            </Link>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-white">
              Automations
            </div>
            <Link
              href="/attendance"
              className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5"
            >
              Attendance
            </Link>
            <Link href="/billing" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">Billing</Link>
            <Link href="/analytics" className="block rounded-xl px-3 py-2.5 text-zinc-500 hover:bg-white/5">Analytics</Link>
          </nav>
        </aside>

        <section className="min-w-0 p-4 sm:p-7 lg:p-9">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Governed Workflow Engine
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Automations
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-500">
                Visual control plane over a versioned backend runtime with
                events, conditions, waits, approvals, actions and durable
                execution state.
              </p>
            </div>
            <button
              onClick={() => void loadOverview()}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              Refresh
            </button>
          </header>

          {error ? (
            <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Workflows" value={metrics.workflows} />
            <Metric label="Active" value={metrics.active} />
            <Metric label="Waiting / action" value={metrics.waiting} />
            <Metric label="Pending approvals" value={metrics.approvals} />
          </div>

          <div
            className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025] p-1"
            role="tablist"
            aria-label="Automation workspace views"
          >
            {(['builder', 'runs', 'approvals'] as Tab[]).map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
                className={
                  'rounded-lg px-4 py-2 text-sm capitalize ' +
                  (tab === item
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-500 hover:text-zinc-300')
                }
              >
                {item}
              </button>
            ))}
          </div>

          {tab === 'builder' ? (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[320px_1fr_330px]">
              <div className="space-y-5">
                <form
                  onSubmit={createWorkflow}
                  className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"
                >
                  <h2 className="font-semibold">New workflow</h2>
                  <div className="mt-4 grid gap-3">
                    <input
                      className={field}
                      name="name"
                      placeholder="Workflow name"
                      required
                    />
                    <input
                      className={field}
                      name="key"
                      placeholder="workflow-key"
                      required
                    />
                    <textarea
                      name="description"
                      rows={3}
                      placeholder="Description"
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-violet-400/50"
                    />
                    <select
                      name="triggerType"
                      defaultValue="EVENT"
                      className={field}
                    >
                      <option value="EVENT">Event trigger</option>
                      <option value="MANUAL">Manual trigger</option>
                    </select>
                    <input
                      className={field}
                      name="eventType"
                      defaultValue="crm.lead.created.v1"
                      placeholder="Event type"
                    />
                    <button
                      disabled={busy}
                      className="h-10 rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60"
                    >
                      Create workflow
                    </button>
                  </div>
                </form>

                <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                  <h2 className="font-semibold">Workflow</h2>
                  <select
                    value={selectedWorkflowId ?? ''}
                    onChange={(event) =>
                      setSelectedWorkflowId(event.target.value)
                    }
                    className={field + ' mt-4 w-full'}
                  >
                    <option value="">Select workflow</option>
                    {workflows.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.status}
                      </option>
                    ))}
                  </select>

                  <div className="mt-3 flex gap-2">
                    <select
                      value={selectedVersionId ?? ''}
                      onChange={(event) => {
                        setSelectedVersionId(event.target.value);
                        setVersionComparison(undefined);
                      }}
                      className={field + ' min-w-0 flex-1'}
                    >
                      <option value="">Version</option>
                      {versions.map((item) => (
                        <option key={item.id} value={item.id}>
                          v{item.version} · {item.status}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void comparePreviousVersion()}
                      disabled={busy || !selectedVersion || selectedVersion.version <= 1}
                      className="rounded-xl border border-white/10 px-3 text-xs text-zinc-300 disabled:opacity-40"
                    >
                      Compare
                    </button>
                    <button
                      onClick={() => void createVersion()}
                      disabled={busy || !selectedWorkflowId}
                      className="rounded-xl border border-white/10 px-3 text-xs text-zinc-300"
                    >
                      New v
                    </button>
                  </div>

                  {selectedWorkflow ? (
                    <div className="mt-4 rounded-xl border border-white/[0.07] p-3 text-xs leading-5 text-zinc-500">
                      <div className="font-medium text-zinc-300">
                        {selectedWorkflow.name}
                      </div>
                      <div className="mt-1">{selectedWorkflow.key}</div>
                      <div className="mt-2">
                        {selectedVersion?.triggerType ?? '—'} · max{' '}
                        {selectedVersion?.maxSteps ?? '—'} steps
                      </div>
                    </div>
                  ) : null}

                  {versionComparison ? (
                    <div className="mt-3 rounded-xl border border-violet-400/15 bg-violet-400/[0.035] p-3 text-xs leading-5 text-zinc-500">
                      <div className="font-medium text-violet-200">
                        v{versionComparison.baseVersion} → v
                        {versionComparison.targetVersion}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>
                          Nodes +{versionComparison.addedNodes.length} / −
                          {versionComparison.removedNodes.length}
                        </span>
                        <span>
                          Changed {versionComparison.changedNodes.length}
                        </span>
                        <span>
                          Edges +{versionComparison.addedEdges.length} / −
                          {versionComparison.removedEdges.length}
                        </span>
                        <span>
                          Changed {versionComparison.changedEdges.length}
                        </span>
                      </div>
                      {[
                        ...versionComparison.addedNodes.map(
                          (item) => '+ node ' + item,
                        ),
                        ...versionComparison.removedNodes.map(
                          (item) => '− node ' + item,
                        ),
                        ...versionComparison.changedNodes.map(
                          (item) => 'Δ node ' + item,
                        ),
                        ...versionComparison.addedEdges.map(
                          (item) => '+ edge ' + item,
                        ),
                        ...versionComparison.removedEdges.map(
                          (item) => '− edge ' + item,
                        ),
                        ...versionComparison.changedEdges.map(
                          (item) => 'Δ edge ' + item,
                        ),
                      ].length ? (
                        <div className="mt-2 max-h-28 overflow-y-auto rounded-lg bg-black/20 p-2 font-mono text-[10px] text-zinc-500">
                          {[
                            ...versionComparison.addedNodes.map(
                              (item) => '+ node ' + item,
                            ),
                            ...versionComparison.removedNodes.map(
                              (item) => '− node ' + item,
                            ),
                            ...versionComparison.changedNodes.map(
                              (item) => 'Δ node ' + item,
                            ),
                            ...versionComparison.addedEdges.map(
                              (item) => '+ edge ' + item,
                            ),
                            ...versionComparison.removedEdges.map(
                              (item) => '− edge ' + item,
                            ),
                            ...versionComparison.changedEdges.map(
                              (item) => 'Δ edge ' + item,
                            ),
                          ].join('\n')}
                        </div>
                      ) : (
                        <div className="mt-2 text-emerald-300">
                          No behavioral graph changes.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                  <h2 className="font-semibold">Node palette</h2>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(
                      [
                        'ACTION',
                        'CONDITION',
                        'WAIT',
                        'APPROVAL',
                        'END',
                      ] as GraphNode['nodeType'][]
                    ).map((type) => (
                      <button
                        key={type}
                        onClick={() => addNode(type)}
                        disabled={
                          !selectedVersion ||
                          selectedVersion.status !== 'DRAFT'
                        }
                        className="rounded-xl border border-white/[0.08] px-3 py-3 text-left text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                      >
                        <div className="font-semibold">{type}</div>
                        <div className="mt-1 text-[11px] text-zinc-600">
                          {nodeHint(type)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">Workflow canvas</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Start node: {startNodeKey || 'not selected'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveGraph()}
                      disabled={
                        busy ||
                        !selectedVersion ||
                        selectedVersion.status !== 'DRAFT'
                      }
                      className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-300 disabled:opacity-40"
                    >
                      Save graph
                    </button>
                    <button
                      onClick={() => void activateVersion()}
                      disabled={
                        busy ||
                        !selectedVersion ||
                        selectedVersion.status !== 'DRAFT'
                      }
                      className="rounded-xl bg-violet-400 px-4 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                    >
                      Activate
                    </button>
                  </div>
                </div>

                <div className="h-[720px]">
                  <ReactFlow
                    nodes={displayedNodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={(_event, node) => {
                      setSelectedNodeId(node.id);
                      setSelectedEdgeId(undefined);
                      setConfigText(
                        JSON.stringify(
                          (node.data as CanvasData).config ?? {},
                          null,
                          2,
                        ),
                      );
                    }}
                    onEdgeClick={(_event, edge) => {
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId(undefined);
                      const data = (edge.data ?? {}) as Record<
                        string,
                        unknown
                      >;
                      setEdgeBranch(
                        typeof data.branchKey === 'string'
                          ? data.branchKey
                          : 'DEFAULT',
                      );
                      setEdgePriority(
                        String(Number(data.priority ?? 0)),
                      );
                    }}
                    fitView
                    nodesConnectable={
                      selectedVersion?.status === 'DRAFT'
                    }
                    nodesDraggable={
                      selectedVersion?.status === 'DRAFT'
                    }
                    elementsSelectable
                    className="premium-flow bg-[#090c12]"
                  >
                    <Background gap={24} size={1} />
                    <MiniMap pannable zoomable />
                    <Controls />
                  </ReactFlow>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                  <h2 className="font-semibold">Inspector</h2>

                  {selectedNode ? (
                    <div className="mt-4 grid gap-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-zinc-600">
                        Node · {selectedNode.data.nodeType}
                      </div>
                      <input
                        className={field}
                        value={selectedNode.data.label}
                        onChange={(event) =>
                          updateNodeName(event.target.value)
                        }
                        disabled={selectedVersion?.status !== 'DRAFT'}
                      />
                      <label className="flex items-center gap-2 rounded-xl border border-white/[0.07] p-3 text-xs text-zinc-400">
                        <input
                          type="radio"
                          checked={startNodeKey === selectedNode.id}
                          onChange={() => setStartNodeKey(selectedNode.id)}
                          disabled={selectedVersion?.status !== 'DRAFT'}
                        />
                        Start workflow here
                      </label>
                      <TypedNodeInspector
                        node={selectedNode}
                        disabled={selectedVersion?.status !== 'DRAFT'}
                        onChange={updateSelectedNodeConfig}
                      />

                      <details className="rounded-xl border border-white/[0.07] bg-black/10">
                        <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-500">
                          Advanced JSON
                        </summary>
                        <div className="grid gap-3 border-t border-white/[0.06] p-3">
                          <textarea
                            rows={12}
                            value={configText}
                            onChange={(event) =>
                              setConfigText(event.target.value)
                            }
                            disabled={selectedVersion?.status !== 'DRAFT'}
                            className="rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5 text-zinc-300 outline-none focus:border-violet-400/50"
                          />
                          <button
                            onClick={updateNodeConfig}
                            disabled={selectedVersion?.status !== 'DRAFT'}
                            className="h-10 rounded-xl border border-white/10 text-sm text-zinc-300 disabled:opacity-40"
                          >
                            Apply advanced JSON
                          </button>
                        </div>
                      </details>
                    </div>
                  ) : selectedEdge ? (
                    <div className="mt-4 grid gap-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-zinc-600">
                        Edge · {selectedEdge.source} → {selectedEdge.target}
                      </div>
                      <label className="grid gap-1.5 text-xs text-zinc-500">
                        Branch
                        <select
                          value={edgeBranch}
                          onChange={(event) =>
                            setEdgeBranch(event.target.value)
                          }
                          className={field}
                          disabled={selectedVersion?.status !== 'DRAFT'}
                        >
                          <option value="DEFAULT">DEFAULT</option>
                          <option value="TRUE">TRUE</option>
                          <option value="FALSE">FALSE</option>
                          <option value="APPROVED">APPROVED</option>
                          <option value="REJECTED">REJECTED</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs text-zinc-500">
                        Priority
                        <input
                          className={field}
                          value={edgePriority}
                          onChange={(event) =>
                            setEdgePriority(event.target.value)
                          }
                          inputMode="numeric"
                          disabled={selectedVersion?.status !== 'DRAFT'}
                        />
                      </label>
                      <button
                        onClick={updateEdge}
                        disabled={selectedVersion?.status !== 'DRAFT'}
                        className="h-10 rounded-xl border border-white/10 text-sm text-zinc-300 disabled:opacity-40"
                      >
                        Apply edge settings
                      </button>
                    </div>
                  ) : (
                    <div className="mt-8 text-sm leading-6 text-zinc-600">
                      Select a node or edge to edit its governed configuration.
                    </div>
                  )}
                </div>

                {selectedVersion?.triggerType === 'MANUAL' &&
                selectedWorkflowId ? (
                  <form
                    onSubmit={triggerManual}
                    className="rounded-2xl border border-white/10 bg-[#0d1017] p-5"
                  >
                    <h2 className="font-semibold">Manual test run</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Runs the active version only. Draft graphs are never
                      executed.
                    </p>
                    <textarea
                      name="context"
                      rows={8}
                      defaultValue={JSON.stringify(
                        { source: 'playground' },
                        null,
                        2,
                      )}
                      className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5 text-zinc-300 outline-none"
                    />
                    <button
                      disabled={busy}
                      className="mt-3 h-10 w-full rounded-xl bg-white text-sm font-semibold text-zinc-950 disabled:opacity-60"
                    >
                      Start active workflow
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ) : null}
          {tab === 'runs' ? (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[1fr_430px]">
              <section className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <h2 className="font-semibold">Automation runs</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Durable execution state across events, waits, approvals,
                  retries and failures.
                </p>
                <div className="mt-5 overflow-x-auto">
                  <div className="min-w-[1080px] overflow-hidden rounded-xl border border-white/[0.07]">
                    <div className="grid grid-cols-[1.2fr_.8fr_.8fr_.6fr_1fr_1.3fr_.6fr] gap-3 border-b border-white/[0.07] px-4 py-3 text-xs uppercase text-zinc-600">
                      <span>Started</span>
                      <span>Status</span>
                      <span>Trigger</span>
                      <span>Steps</span>
                      <span>Current / wake</span>
                      <span>Issue</span>
                      <span>Trace</span>
                    </div>
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className={
                          'grid grid-cols-[1.2fr_.8fr_.8fr_.6fr_1fr_1.3fr_.6fr] gap-3 border-b border-white/[0.05] px-4 py-3 text-xs last:border-0 ' +
                          (runDetail?.run.id === run.id
                            ? 'bg-violet-400/[0.05]'
                            : '')
                        }
                      >
                        <span className="text-zinc-500">
                          {new Date(run.startedAt).toLocaleString()}
                        </span>
                        <span className="text-zinc-300">{run.status}</span>
                        <span className="text-zinc-500">
                          {run.triggerEventType ?? run.triggerType}
                        </span>
                        <span className="text-zinc-500">
                          {run.stepsExecuted}
                        </span>
                        <span className="text-zinc-500">
                          {run.currentNodeKey ??
                            (run.wakeAt
                              ? new Date(run.wakeAt).toLocaleString()
                              : '—')}
                        </span>
                        <span className="truncate text-zinc-600">
                          {run.lastError ?? '—'}
                        </span>
                        <button
                          onClick={() => void loadRunDetail(run.id)}
                          className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5"
                        >
                          Inspect
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="h-fit rounded-2xl border border-white/10 bg-[#0d1017] p-5 2xl:sticky 2xl:top-6">
                <h2 className="font-semibold">Live trace</h2>
                {!runDetail ? (
                  <div className="mt-8 text-sm leading-6 text-zinc-600">
                    Select a run to inspect its exact node-by-node execution
                    history.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-white/[0.07] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">
                          {runDetail.run.status}
                        </span>
                        <span className="text-[11px] text-zinc-600">
                          {runDetail.run.stepsExecuted} steps
                        </span>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-zinc-500">
                        Current: {runDetail.run.currentNodeKey ?? '—'}
                        {runDetail.run.wakeAt
                          ? ' · wake ' +
                            new Date(runDetail.run.wakeAt).toLocaleString()
                          : ''}
                      </div>
                      {runDetail.run.lastError ? (
                        <div className="mt-3 rounded-lg bg-red-400/[0.06] p-2 text-xs leading-5 text-red-300">
                          {runDetail.run.lastError}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => openRunOnCanvas(runDetail)}
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300"
                        >
                          Show on canvas
                        </button>
                        {['RUNNING', 'WAITING'].includes(
                          runDetail.run.status,
                        ) ? (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void runControl(
                                runDetail.run.id,
                                'pause',
                              )
                            }
                            className="rounded-lg border border-amber-400/20 px-3 py-1.5 text-xs text-amber-300"
                          >
                            Pause
                          </button>
                        ) : null}
                        {runDetail.run.status === 'PAUSED' ? (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void runControl(
                                runDetail.run.id,
                                'resume-paused',
                              )
                            }
                            className="rounded-lg bg-violet-400 px-3 py-1.5 text-xs font-semibold text-zinc-950"
                          >
                            Resume
                          </button>
                        ) : null}
                        {runDetail.run.status === 'ACTION_REQUIRED' ? (
                          <>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void runControl(
                                  runDetail.run.id,
                                  'reconcile-retry',
                                )
                              }
                              className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950"
                            >
                              Confirm & retry
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void runControl(
                                  runDetail.run.id,
                                  'reconcile-cancel',
                                )
                              }
                              className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300"
                            >
                              Cancel after review
                            </button>
                          </>
                        ) : null}
                        {!['COMPLETED', 'FAILED', 'CANCELLED'].includes(
                          runDetail.run.status,
                        ) &&
                        runDetail.run.status !== 'ACTION_REQUIRED' ? (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void runControl(
                                runDetail.run.id,
                                'cancel',
                              )
                            }
                            className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                      {runDetail.steps.map((step) => (
                        <details
                          key={step.id}
                          className="rounded-xl border border-white/[0.07] bg-black/10"
                        >
                          <summary className="cursor-pointer px-3 py-3 text-xs">
                            <div className="inline-flex w-[calc(100%-12px)] items-center justify-between gap-3">
                              <span>
                                {step.nodeKey} · {step.nodeType}
                              </span>
                              <span className="text-zinc-500">
                                {step.status} · #{step.attempt}
                              </span>
                            </div>
                          </summary>
                          <div className="grid gap-2 border-t border-white/[0.06] p-3 text-[11px] leading-5 text-zinc-500">
                            {step.errorMessage ? (
                              <div className="text-red-300">
                                {step.errorMessage}
                              </div>
                            ) : null}
                            <div>
                              Started:{' '}
                              {new Date(step.startedAt).toLocaleString()}
                            </div>
                            {step.completedAt ? (
                              <div>
                                Completed:{' '}
                                {new Date(
                                  step.completedAt,
                                ).toLocaleString()}
                              </div>
                            ) : null}
                            <pre className="overflow-x-auto rounded-lg bg-black/30 p-2 text-[10px] text-zinc-400">
                              {JSON.stringify(
                                {
                                  input: step.input,
                                  output: step.output,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {tab === 'approvals' ? (
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <h2 className="font-semibold">Human approval queue</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Workflow execution stops here until an authorized tenant
                member decides.
              </p>
              <div className="mt-5 space-y-3">
                {approvals.map((approval) => (
                  <article
                    key={approval.id}
                    className="rounded-xl border border-white/[0.07] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{approval.title}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {approval.status} · requested{' '}
                          {new Date(
                            approval.requestedAt,
                          ).toLocaleString()}
                        </div>
                        {approval.description ? (
                          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
                            {approval.description}
                          </p>
                        ) : null}
                      </div>
                      {approval.status === 'PENDING' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              void decideApproval(
                                approval.id,
                                'REJECTED',
                              )
                            }
                            disabled={busy}
                            className="rounded-xl border border-red-400/20 px-4 py-2 text-xs text-red-300 disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() =>
                              void decideApproval(
                                approval.id,
                                'APPROVED',
                              )
                            }
                            disabled={busy}
                            className="rounded-xl bg-violet-400 px-4 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
                {!approvals.length ? (
                  <div className="py-14 text-center text-sm text-zinc-600">
                    No approval requests.
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </article>
  );
}

function nodeHint(type: GraphNode['nodeType']) {
  if (type === 'ACTION') return 'CRM, WhatsApp or AI action';
  if (type === 'CONDITION') return 'TRUE / FALSE branch';
  if (type === 'WAIT') return 'Durable timed pause';
  if (type === 'APPROVAL') return 'Human decision gate';
  return 'Finish the run';
}

function TypedNodeInspector({
  node,
  disabled,
  onChange,
}: {
  node: Node<CanvasData>;
  disabled: boolean;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const config = node.data.config ?? {};
  const update = (patch: Record<string, unknown>) =>
    onChange({ ...config, ...patch });

  if (node.data.nodeType === 'ACTION') {
    const action =
      typeof config.action === 'string'
        ? config.action
        : 'CRM_CREATE_TASK';
    const input =
      config.input &&
      typeof config.input === 'object' &&
      !Array.isArray(config.input)
        ? (config.input as Record<string, unknown>)
        : {};
    const retry =
      config.retry &&
      typeof config.retry === 'object' &&
      !Array.isArray(config.retry)
        ? (config.retry as Record<string, unknown>)
        : undefined;
    const retrySafe = [
      'CRM_UPDATE_LEAD',
      'WHATSAPP_SEND_TEXT',
      'WHATSAPP_SEND_TEMPLATE',
      'SET_CONVERSATION_MODE',
    ].includes(action);

    const updateInput = (key: string, value: unknown) =>
      update({ input: { ...input, [key]: value } });

    return (
      <div className="grid gap-3 rounded-xl border border-violet-400/10 bg-violet-400/[0.035] p-3">
        <label className="grid gap-1.5 text-xs text-zinc-500">
          Action
          <select
            className={field}
            value={action}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                action: event.target.value,
                input: defaultActionInput(event.target.value),
              })
            }
          >
            <option value="CRM_CREATE_TASK">Create CRM task</option>
            <option value="CRM_UPDATE_LEAD">Update CRM lead</option>
            <option value="WHATSAPP_SEND_TEXT">Send WhatsApp text</option>
            <option value="WHATSAPP_SEND_TEMPLATE">
              Send WhatsApp template
            </option>
            <option value="AI_RUN_AGENT">Run AI agent</option>
            <option value="SET_CONVERSATION_MODE">
              Set conversation mode
            </option>
          </select>
        </label>

        {action === 'CRM_CREATE_TASK' ? (
          <>
            <TypedText
              label="Task title"
              value={input.title}
              disabled={disabled}
              onChange={(value) => updateInput('title', value)}
              placeholder="Follow up {{event.payload.name}}"
            />
            <TypedText
              label="Description"
              value={input.description}
              disabled={disabled}
              onChange={(value) => updateInput('description', value)}
              placeholder="Optional task description"
            />
            <TypedText
              label="Contact ID / template"
              value={input.contactId}
              disabled={disabled}
              onChange={(value) => updateInput('contactId', value)}
              placeholder="{{event.payload.contactId}}"
            />
            <label className="grid gap-1.5 text-xs text-zinc-500">
              Priority
              <select
                className={field}
                disabled={disabled}
                value={
                  typeof input.priority === 'string'
                    ? input.priority
                    : 'NORMAL'
                }
                onChange={(event) =>
                  updateInput('priority', event.target.value)
                }
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </label>
          </>
        ) : null}

        {action === 'CRM_UPDATE_LEAD' ? (
          <>
            <TypedText
              label="Lead ID / template"
              value={input.leadId}
              disabled={disabled}
              onChange={(value) => updateInput('leadId', value)}
              placeholder="{{event.aggregateId}}"
            />
            <label className="grid gap-1.5 text-xs text-zinc-500">
              Status
              <select
                className={field}
                disabled={disabled}
                value={
                  typeof input.status === 'string' ? input.status : 'OPEN'
                }
                onChange={(event) =>
                  updateInput('status', event.target.value)
                }
              >
                <option value="OPEN">Open</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="UNQUALIFIED">Unqualified</option>
                <option value="LOST">Lost</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs text-zinc-500">
              Temperature
              <select
                className={field}
                disabled={disabled}
                value={
                  typeof input.temperature === 'string'
                    ? input.temperature
                    : 'COLD'
                }
                onChange={(event) =>
                  updateInput('temperature', event.target.value)
                }
              >
                <option value="COLD">Cold</option>
                <option value="WARM">Warm</option>
                <option value="HOT">Hot</option>
                <option value="LOST">Lost</option>
              </select>
            </label>
            <TypedText
              label="Score"
              value={input.score}
              disabled={disabled}
              onChange={(value) =>
                updateInput(
                  'score',
                  value === '' ? undefined : Number(value),
                )
              }
              placeholder="0-100"
            />
          </>
        ) : null}

        {action === 'WHATSAPP_SEND_TEXT' ? (
          <>
            <TypedText
              label="Conversation ID / template"
              value={input.conversationId}
              disabled={disabled}
              onChange={(value) =>
                updateInput('conversationId', value)
              }
              placeholder="{{event.payload.conversationId}}"
            />
            <label className="grid gap-1.5 text-xs text-zinc-500">
              Message
              <textarea
                rows={5}
                disabled={disabled}
                value={typeof input.text === 'string' ? input.text : ''}
                onChange={(event) =>
                  updateInput('text', event.target.value)
                }
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
                placeholder="Hi {{event.payload.name}}, ..."
              />
            </label>
          </>
        ) : null}

        {action === 'WHATSAPP_SEND_TEMPLATE' ? (
          <>
            <TypedText
              label="Conversation ID / template"
              value={input.conversationId}
              disabled={disabled}
              onChange={(value) =>
                updateInput('conversationId', value)
              }
              placeholder="{{event.payload.conversationId}}"
            />
            <TypedText
              label="Template ID / template"
              value={input.templateId}
              disabled={disabled}
              onChange={(value) => updateInput('templateId', value)}
              placeholder="{{event.payload.templateId}}"
            />
          </>
        ) : null}

        {action === 'AI_RUN_AGENT' ? (
          <>
            <TypedText
              label="Agent ID"
              value={input.agentId}
              disabled={disabled}
              onChange={(value) => updateInput('agentId', value)}
              placeholder="AI agent UUID"
            />
            <label className="grid gap-1.5 text-xs text-zinc-500">
              Prompt
              <textarea
                rows={5}
                disabled={disabled}
                value={
                  typeof input.input === 'string' ? input.input : ''
                }
                onChange={(event) =>
                  updateInput('input', event.target.value)
                }
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
                placeholder="Qualify this lead using {{event.payload...}}"
              />
            </label>
            <label className="grid gap-1.5 text-xs text-zinc-500">
              Model routing
              <select
                className={field}
                disabled={disabled}
                value={
                  typeof input.routing === 'string'
                    ? input.routing
                    : 'AGENT_DEFAULT'
                }
                onChange={(event) =>
                  updateInput('routing', event.target.value)
                }
              >
                <option value="AGENT_DEFAULT">Agent default</option>
                <option value="FAST">Fast</option>
                <option value="REASONING">Reasoning</option>
              </select>
            </label>
          </>
        ) : null}

        {action === 'SET_CONVERSATION_MODE' ? (
          <>
            <TypedText
              label="Conversation ID / template"
              value={input.conversationId}
              disabled={disabled}
              onChange={(value) =>
                updateInput('conversationId', value)
              }
              placeholder="{{event.payload.conversationId}}"
            />
            <label className="grid gap-1.5 text-xs text-zinc-500">
              Handling mode
              <select
                className={field}
                disabled={disabled}
                value={
                  typeof input.handlingMode === 'string'
                    ? input.handlingMode
                    : 'HUMAN'
                }
                onChange={(event) =>
                  updateInput('handlingMode', event.target.value)
                }
              >
                <option value="HUMAN">Human</option>
                <option value="AI_ASSIST">AI Assist</option>
                <option value="AI">AI autonomous</option>
              </select>
            </label>
          </>
        ) : null}

        <label className="flex items-start gap-3 rounded-xl border border-white/[0.07] p-3 text-xs text-zinc-400">
          <input
            type="checkbox"
            className="mt-0.5"
            disabled={disabled || !retrySafe}
            checked={Boolean(retry)}
            onChange={(event) => {
              if (event.target.checked) {
                update({
                  retry: {
                    maxAttempts: 3,
                    backoffSeconds: 5,
                    multiplier: 2,
                    maxBackoffSeconds: 300,
                  },
                });
              } else {
                const next = { ...config };
                delete next.retry;
                onChange(next);
              }
            }}
          />
          <span>
            Safe automatic retry
            <span className="mt-1 block text-[11px] leading-4 text-zinc-600">
              Enabled only for actions with idempotent or state-setting
              semantics. Ambiguous AI/external effects require operator
              reconciliation.
            </span>
          </span>
        </label>

        {retry ? (
          <div className="grid grid-cols-2 gap-2">
            <TypedNumber
              label="Max attempts"
              value={retry.maxAttempts}
              disabled={disabled}
              min={2}
              max={10}
              onChange={(value) =>
                update({
                  retry: { ...retry, maxAttempts: value },
                })
              }
            />
            <TypedNumber
              label="Backoff seconds"
              value={retry.backoffSeconds}
              disabled={disabled}
              min={1}
              max={3600}
              onChange={(value) =>
                update({
                  retry: { ...retry, backoffSeconds: value },
                })
              }
            />
            <TypedNumber
              label="Multiplier"
              value={retry.multiplier}
              disabled={disabled}
              min={1}
              max={10}
              onChange={(value) =>
                update({
                  retry: { ...retry, multiplier: value },
                })
              }
            />
            <TypedNumber
              label="Max backoff"
              value={retry.maxBackoffSeconds}
              disabled={disabled}
              min={1}
              max={86400}
              onChange={(value) =>
                update({
                  retry: { ...retry, maxBackoffSeconds: value },
                })
              }
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (node.data.nodeType === 'CONDITION') {
    return (
      <div className="grid gap-3 rounded-xl border border-sky-400/10 bg-sky-400/[0.035] p-3">
        <TypedText
          label="Context path"
          value={config.path}
          disabled={disabled}
          onChange={(value) => update({ path: value })}
          placeholder="event.payload.score"
        />
        <label className="grid gap-1.5 text-xs text-zinc-500">
          Operator
          <select
            className={field}
            disabled={disabled}
            value={
              typeof config.operator === 'string'
                ? config.operator
                : 'EQUALS'
            }
            onChange={(event) =>
              update({ operator: event.target.value })
            }
          >
            <option value="EQUALS">Equals</option>
            <option value="NOT_EQUALS">Not equals</option>
            <option value="EXISTS">Exists</option>
            <option value="IN">In list</option>
            <option value="GT">Greater than</option>
            <option value="GTE">Greater than/equal</option>
            <option value="LT">Less than</option>
            <option value="LTE">Less than/equal</option>
          </select>
        </label>
        {config.operator !== 'EXISTS' ? (
          <TypedText
            label="Comparison value"
            value={config.value}
            disabled={disabled}
            onChange={(value) => update({ value })}
            placeholder="QUALIFIED"
          />
        ) : null}
      </div>
    );
  }

  if (node.data.nodeType === 'WAIT') {
    return (
      <div className="grid gap-3 rounded-xl border border-amber-400/10 bg-amber-400/[0.035] p-3">
        <TypedNumber
          label="Wait seconds"
          value={config.durationSeconds}
          disabled={disabled}
          min={1}
          max={2592000}
          onChange={(value) => update({ durationSeconds: value })}
        />
        <div className="text-[11px] leading-5 text-zinc-600">
          Durable wait. The scheduler resumes this run even after a server
          restart.
        </div>
      </div>
    );
  }

  if (node.data.nodeType === 'APPROVAL') {
    return (
      <div className="grid gap-3 rounded-xl border border-fuchsia-400/10 bg-fuchsia-400/[0.035] p-3">
        <TypedText
          label="Approval title"
          value={config.title}
          disabled={disabled}
          onChange={(value) => update({ title: value })}
          placeholder="Approve this action"
        />
        <label className="grid gap-1.5 text-xs text-zinc-500">
          Description
          <textarea
            rows={4}
            disabled={disabled}
            value={
              typeof config.description === 'string'
                ? config.description
                : ''
            }
            onChange={(event) =>
              update({ description: event.target.value })
            }
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
          />
        </label>
        <TypedNumber
          label="Expiry seconds"
          value={config.expirySeconds}
          disabled={disabled}
          min={60}
          max={604800}
          onChange={(value) => update({ expirySeconds: value })}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.035] p-3 text-xs leading-5 text-zinc-500">
      END closes the run successfully and cannot have outgoing edges.
    </div>
  );
}

function TypedText({
  label,
  value,
  disabled,
  onChange,
  placeholder,
}: {
  label: string;
  value: unknown;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs text-zinc-500">
      {label}
      <input
        className={field}
        disabled={disabled}
        value={
          typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : ''
        }
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TypedNumber({
  label,
  value,
  disabled,
  min,
  max,
  onChange,
}: {
  label: string;
  value: unknown;
  disabled: boolean;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs text-zinc-500">
      {label}
      <input
        className={field}
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        value={Number.isFinite(Number(value)) ? Number(value) : min}
        onChange={(event) =>
          onChange(Number.parseInt(event.target.value || String(min), 10))
        }
      />
    </label>
  );
}

function defaultActionInput(action: string) {
  if (action === 'CRM_CREATE_TASK') {
    return { title: 'Automation follow-up task', priority: 'NORMAL' };
  }
  if (action === 'CRM_UPDATE_LEAD') {
    return { leadId: '{{event.aggregateId}}', status: 'OPEN' };
  }
  if (action === 'WHATSAPP_SEND_TEXT') {
    return {
      conversationId: '{{event.payload.conversationId}}',
      text: 'Hello {{event.payload.name}}',
    };
  }
  if (action === 'WHATSAPP_SEND_TEMPLATE') {
    return {
      conversationId: '{{event.payload.conversationId}}',
      templateId: '{{event.payload.templateId}}',
    };
  }
  if (action === 'AI_RUN_AGENT') {
    return { agentId: '', input: '', routing: 'AGENT_DEFAULT' };
  }
  if (action === 'SET_CONVERSATION_MODE') {
    return {
      conversationId: '{{event.payload.conversationId}}',
      handlingMode: 'HUMAN',
    };
  }
  return {};
}
