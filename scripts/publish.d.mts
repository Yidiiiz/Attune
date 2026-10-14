// Owns: typed local-export boundary. Failure behavior: prepareExport refuses unsafe paths and cleans failures.
export function prepareExport(root: string, revision?: string): Promise<string>;
