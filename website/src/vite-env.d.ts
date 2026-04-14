/// <reference types="vite/client" />

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
