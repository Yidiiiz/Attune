// Owns: typed audit boundaries. Failure behavior: runtime refusals are implemented in publish-files.mjs.
export function excluded(rel: string): boolean;
export function exportFiles(names: string[]): string[];
export function readFiles(root: string, names: string[]): Promise<Map<string, Buffer>>;
export function dataLiterals(rel: string, text: string): string[];
export function seedProblems(files: Map<string, Buffer>): string[];
export function auditFiles(files: Map<string, Buffer>, identity?: string[]): string[];
