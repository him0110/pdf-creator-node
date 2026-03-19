interface IfCondOptions {
  fn: (context: any) => string;
  inverse: (context: any) => string;
}

interface Document {
  html: string;
  data: any;
  type: "buffer" | "stream" | "file";
  path?: string;
}

interface FileInfo {
  filename: string;
}

interface HttpCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httponly?: boolean;
  secure?: boolean;
  expires?: number;
}

interface CreateOptions {
  format?: "A3" | "A4" | "A5" | "Legal" | "Letter" | "Tabloid";
  orientation?: "portrait" | "landscape";
  border?:
    | string
    | { top?: string; right?: string; bottom?: string; left?: string };
  height?: string;
  width?: string;
  header?: {
    height?: string;
    contents: string;
  };
  footer?: {
    height?: string;
    contents:
      | string
      | {
          first?: string;
          default?: string;
          last?: string;
          [page: number]: string;
        };
  };
  type?: "pdf" | "png" | "jpeg";
  quality?: string;
  base?: string;
  timeout?: number;
  renderDelay?: number | "manual";
  zoomFactor?: string;
  httpHeaders?: Record<string, string>;
  httpCookies?: HttpCookie[];
  paginationOffset?: number;
  directory?: string;
  viewportSize?: { width: number; height: number };
}
