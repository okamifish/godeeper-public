import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };

export const mockNode = {
  id: 'test-node-1',
  type: 'textNode',
  position: { x: 100, y: 100 },
  data: {
    kind: 'text' as const,
    title: 'Test Node Title',
    body: 'Test node body content',
    width: 340,
    metaLeft: 'created now',
    metaRight: 'connected x1',
  },
};

export const mockTaskNode = {
  id: 'test-task-1',
  type: 'taskNode',
  position: { x: 500, y: 200 },
  data: {
    kind: 'task' as const,
    title: 'Test Task',
    body: 'Test task prompt content',
    width: 380,
    metaLeft: 'GPT-5',
    metaRight: 'RUN TASK',
    chips: ['context 1', 'context 2'],
    taskStatus: 'idle' as const,
    taskType: 'question' as const,
    author: 'user' as const,
    adopted: true,
  },
};

export const mockLinkNode = {
  id: 'test-link-1',
  type: 'linkNode',
  position: { x: 50, y: 100 },
  data: {
    kind: 'link' as const,
    title: 'Test Source',
    body: 'https://example.com/article',
    width: 340,
    metaLeft: 'web source',
    metaRight: 'parsed',
    sourceLabel: 'SOURCE NODE',
    previewLabel: 'Analyzing',
  },
};

export const mockEdge = {
  id: 'test-edge-1',
  source: 'test-node-1',
  target: 'test-task-1',
  type: 'smoothstep',
  animated: true,
};

export const mockCanvasStore = {
  nodes: [mockNode, mockTaskNode],
  edges: [mockEdge],
  selectedNodeId: 'test-node-1',
  selectedNodeIds: ['test-node-1'],
  timeline: [],
  validatedModels: [],
  selectNode: vi.fn(),
  toggleNodeSelection: vi.fn(),
  clearSelection: vi.fn(),
  runTask: vi.fn(),
  cancelTask: vi.fn(),
  createAiQuestionFromTask: vi.fn(),
  deleteSelectedNodes: vi.fn(),
  duplicateNode: vi.fn(),
  addChildNode: vi.fn(),
  updateNodeData: vi.fn(),
  pushHistory: vi.fn(),
  focusNode: vi.fn(),
  materializeCatalogItem: vi.fn(() => null),
  removeChip: vi.fn(),
  createTaskFromSelection: vi.fn(),
  autoLayout: vi.fn(),
  returnToBranchPoint: vi.fn(),
  importSource: vi.fn(),
};
