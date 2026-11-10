export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Environment {
  w: number;
  h: number;
  pageW: number;
  pageH: number;
  viewW: number;
  viewH: number;
  scrollX: number;
  scrollY: number;
  dpr: number;
  zoom: number;
  bg: string;
}

export type ItemKind = 'box' | 'text' | 'img' | 'media' | 'svg' | 'line' | 'dup' | 'rule';

export interface StyleData {
  bg?: string;
  color?: string;
  borderRadius?: string;
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  boxShadow?: string;
  opacity?: number;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  textTransform?: string;
  overflow?: string;
  clipPath?: string;
  filter?: string;
  backdropFilter?: string;
  cursor?: string;
  [key: string]: any;
}

export interface BlueprintItem {
  id: number;
  kind: ItemKind;
  box: Box;
  clip?: Rect | null;
  style?: StyleData;
  el?: HTMLElement | SVGElement;
  parent?: BlueprintItem | null;
  children?: BlueprintItem[];
  depth?: number;
  v: number; // version / completion state
  revealed?: number; // for text reveal
  text?: string;
  imgUrl?: string;
  svgHtml?: string;
  isDup?: boolean;
  dupSource?: BlueprintItem;
  dupOffset?: { x: number; y: number };
  tag?: string;
  zIndex?: number;
  role?: string;
  agent?: any;
  taskType?: string;
  startT?: number;
  dur?: number;
  [key: string]: any;
}

export interface BlueprintModel {
  items: BlueprintItem[];
  viewportItems: BlueprintItem[];
  roots: BlueprintItem[];
  bg: string;
  w: number;
  h: number;
  shot?: string;
}

export type CursorShape =
  'arrow' | 'dup' | 'pen' | 'pen-add' | 'pen-close' | 'cross' | 'ibeam' | 'ew' | 'ns';

declare global {
  interface Window {
    __siteForge?: {
      toggle: () => void;
      start?: () => void;
      stop?: (reveal?: boolean) => void;
      app?: any;
      debug?: any;
      exportCaptureDebug?: () => void;
    };
    __siteForgeShot?: string | null;
    __siteForgeHidden?: boolean;
  }
}
