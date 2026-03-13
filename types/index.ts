interface IfCondOptions {
  fn: (context: any) => string;
  inverse: (context: any) => string;
}

interface Document {
  html: string;
  data: any;
  type: "buffer" | "stream" | "file" | "";
  path?: string;
}

interface PdfOptions {
  // Paper size
  format?: "A3" | "A4" | "A5" | "Legal" | "Letter" | "Tabloid";
  orientation?: "portrait" | "landscape";
  width?: string;
  height?: string;

  // Margins (mirrors html-pdf's `border` option)
  border?:
    | string
    | {
        top?: string;
        right?: string;
        bottom?: string;
        left?: string;
      };

  // Header / Footer
  header?: {
    height?: string;
    contents?: string;
  };
  footer?: {
    height?: string;
    contents?:
      | string
      | {
          first?: string;
          last?: string;
          default?: string;
          [page: number]: string;
        };
  };

  // Rendering
  printBackground?: boolean;
  base?: string; // base URL for relative resources
  timeout?: number;
}

interface FileInfo {
  filename: string;
}
