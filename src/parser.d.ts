// Tipos do src/parser.js (lógica pura, testada no Node pelo test/packages.tests.js do app).
export interface Task {
  file: string;
  line: number;
  raw: string;
  done: boolean;
  action: string;
  owner: string;
  due: string;
}
export interface ToggleResult { md: string; line: number; raw: string; done: boolean; }
/** project: 'Projeto' ou 'Pai/Projeto' (dois níveis). */
export interface Located { kind: 'meeting' | 'synthesis'; project: string; }

export function normalize(s: unknown): string;
export function headingRe(kind: 'nextSteps' | 'annotations' | 'transcript' | 'meetings', flags?: string): RegExp;
export function resolveDue(text: string, meetingDate: string | Date, lang?: string): Date | null;
export function isDueText(text: string): boolean;
export const TASK_RE: RegExp;
export function parseTaskText(text: string): { action: string; owner: string; due: string };
export function parseCommitments(md: string, file?: string): Task[];
export function toggleTask(md: string, line: number, raw: string, done: boolean): ToggleResult;
export const SYNTHESIS_FILE: string;
export const GROUP_FILE: string;
export const RESERVED_DIRS: Set<string>;
export function isProjectDir(name: string): boolean;
export function isMeetingFrontmatter(fm: Record<string, unknown> | null | undefined): boolean;
export function detectRoot(files: { path: string; frontmatter?: Record<string, unknown> | null }[]): string | null;
export function classify(filePath: string, root: string): Located | null;
