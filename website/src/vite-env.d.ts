/// <reference types="vite/client" />
/// <reference path="../../lib/src/globals.d.ts" />

declare module "@standalone-latest" {
  const data: {
    version: string;
    notes: string;
    pub_date: string;
    platforms: Record<
      string,
      { url: string; signature: string }
    >;
  };
  export default data;
}
