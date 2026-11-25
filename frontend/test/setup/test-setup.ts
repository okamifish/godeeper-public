import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import React from 'react';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
});

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children: React.ReactNode }) => 
    React.createElement('div', { 'data-testid': 'react-flow' }, children),
  Background: () => React.createElement('div', { 'data-testid': 'background' }),
  Controls: () => React.createElement('div', { 'data-testid': 'controls' }),
  MiniMap: () => React.createElement('div', { 'data-testid': 'minimap' }),
  Handle: ({ type, position }: { type: string; position: string }) => 
    React.createElement('div', { 'data-testid': `handle-${type}`, 'data-position': position }),
  Position: {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom',
  },
  MarkerType: {
    ArrowClosed: 'arrowClosed',
  },
  BackgroundVariant: {
    Dots: 'dots',
    Lines: 'lines',
    Cross: 'cross',
  },
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useUpdateNodeInternals: () => vi.fn(),
  useReactFlow: () => ({
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    setViewport: vi.fn(),
    screenToFlowPosition: vi.fn((position) => position),
  }),
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector({ width: 1000, height: 800 }),
  addEdge: vi.fn(),
  applyNodeChanges: vi.fn(),
  applyEdgeChanges: vi.fn(),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => 
    React.createElement(React.Fragment, null, children),
}));

vi.mock('zustand', () => ({
  create: vi.fn((init) => {
    const state = typeof init === 'function' ? init(() => {}) : init;
    return () => state;
  }),
}));

vi.mock('dagre', () => ({
  default: {
    graphlib: {
      Graph: class MockGraph {
        nodes: Map<string, object>;
        edges: Map<string, object>;
        constructor() {
          this.nodes = new Map();
          this.edges = new Map();
        }
        setNode(id: string, data: object) {
          this.nodes.set(id, data);
        }
        setEdge(source: string, target: string) {
          this.edges.set(`${source}-${target}`, { source, target });
        }
        setDefaultEdgeLabel(fn: () => object) {}
        node(id: string) {
          return this.nodes.get(id);
        }
      },
    },
    layout: vi.fn(),
  },
}));
