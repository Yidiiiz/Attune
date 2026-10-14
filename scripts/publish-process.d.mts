// Owns: typed process boundaries. Failure behavior: runtime cleanup/refusal lives in publish-process.mjs.
import type { ChildProcess } from "node:child_process";
export function git(cwd: string, args: string[], input?: string | Buffer): string;
export function cleanEnv(): NodeJS.ProcessEnv;
export function npmCli(): string;
export function stopTree(child?: ChildProcess): void;
export function start(args: string[], cwd: string, env?: NodeJS.ProcessEnv): ChildProcess;
export function command(args: string[], cwd: string, seconds?: number): Promise<void>;
export function temporary(): Promise<string>;
export function removeTemporary(dir: string): Promise<void>;
export function clone(root: string, dir: string): Promise<void>;
export function requireClean(root: string, excluded: (rel: string) => boolean): void;
