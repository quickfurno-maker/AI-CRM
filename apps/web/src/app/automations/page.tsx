'use client';

import Link from 'next/link';
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
            {['Attendance', 'Billing', 'Analytics'].map((item) => (
              <div
                key={item}
                className="rounded-xl px-3 py-2.5 text-zinc-600"
              >
                {item}
              </div>
            ))}
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
            <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Workflows" value={metrics.workflows} />
            <Metric label="Active" value={metrics.active} />
            <Metric label="Waiting / action" value={metrics.waiting} />
            <Metric label="Pending approvals" value={metrics.approvals} />
          </div>

          <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025] p-1">
            {(['builder', 'runs', 'approvals'] as Tab[]).map((item) => (
              <button
                key={item}
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
                      onChange={(event) =>
                        setSelectedVersionId(event.target.value)
                      }
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
                    nodes={nodes}
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
                    className="bg-[#090c12]"
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
                      <textarea
                        rows={14}
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
                        Apply node config
                      </button>
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
            <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <h2 className="font-semibold">Automation runs</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Durable execution state across events, waits, approvals and
                failures.
              </p>
              <div className="mt-5 overflow-x-auto">
                <div className="min-w-[980px] overflow-hidden rounded-xl border border-white/[0.07]">
                  <div className="grid grid-cols-[1.2fr_.8fr_.8fr_.6fr_1fr_1.5fr] gap-3 border-b border-white/[0.07] px-4 py-3 text-xs uppercase text-zinc-600">
                    <span>Started</span>
                    <span>Status</span>
                    <span>Trigger</span>
                    <span>Steps</span>
                    <span>Current / wake</span>
                    <span>Issue</span>
                  </div>
                  {runs.map((run) => (
                    <div
                      key={run.id}
                      className="grid grid-cols-[1.2fr_.8fr_.8fr_.6fr_1fr_1.5fr] gap-3 border-b border-white/[0.05] px-4 py-3 text-xs last:border-0"
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
                    </div>
                  ))}
                </div>
              </div>
            </section>
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
