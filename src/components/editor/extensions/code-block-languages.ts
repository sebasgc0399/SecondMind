export interface CodeLanguage {
  id: string;
  label: string;
}

export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { id: 'bash', label: 'Bash' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'css', label: 'CSS' },
  { id: 'dart', label: 'Dart' },
  { id: 'go', label: 'Go' },
  { id: 'haskell', label: 'Haskell' },
  { id: 'xml', label: 'HTML, XML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'lua', label: 'Lua' },
  { id: 'matlab', label: 'Matlab' },
  { id: 'php', label: 'php' },
  { id: 'plaintext', label: 'Plain text' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'python', label: 'Python' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' },
  { id: 'scala', label: 'Scala' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'typescript', label: 'TypeScript' },
];

export function findLanguageLabel(id: string | null | undefined): string {
  if (!id) return 'Auto';
  return CODE_LANGUAGES.find((l) => l.id === id)?.label ?? 'Auto';
}
