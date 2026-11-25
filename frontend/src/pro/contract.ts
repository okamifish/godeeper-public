/** 公开的 Pro UI 插槽契约；实现由私有仓库提供，社区版为空组件。 */

export interface TrashCanvasItem {
  id: string;
  title?: string | null;
}

export interface TrashSectionProps {
  canvases: TrashCanvasItem[];
  onRestore: (id: string) => void;
  labels: {
    trash: string;
    restore: string;
  };
}

export interface CrossCanvasSearchHit {
  id: string;
  canvasId: string;
  canvasTitle?: string | null;
  title?: string | null;
  locked?: boolean;
}

export interface CrossCanvasSearchResultsProps {
  results: CrossCanvasSearchHit[];
  locked: boolean;
  onPick: (hit: CrossCanvasSearchHit) => void;
  labels: {
    section: string;
    crossTag: string;
    proTag: string;
    untitledNode: string;
    untitledCanvas: string;
  };
}
