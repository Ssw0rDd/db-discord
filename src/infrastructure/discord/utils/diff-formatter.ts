export interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}

const STATUS_LABEL: Record<string, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  renamed: 'Renamed',
  copied: 'Copied',
  changed: 'Changed',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function statusIcon(status: string): string {
  if (status === 'added') return '🟢';
  if (status === 'removed') return '🔴';
  if (status === 'renamed') return '🟡';
  return '🔵';
}

export function formatDiffSummary(files: DiffFile[]): string {
  const added = files.filter((f) => f.status === 'added').length;
  const removed = files.filter((f) => f.status === 'removed').length;
  const modified = files.filter((f) => f.status !== 'added' && f.status !== 'removed').length;
  const linesAdd = files.reduce((s, f) => s + f.additions, 0);
  const linesDel = files.reduce((s, f) => s + f.deletions, 0);

  return (
    `**Change summary**\n` +
    `📁 ${files.length} file(s) · 🟢 ${added} added · 🔵 ${modified} modified · 🔴 ${removed} removed\n` +
    `➕ ${linesAdd} lines added · ➖ ${linesDel} lines removed`
  );
}

export function formatDiffFileDetail(file: DiffFile, index: number, total: number): string {
  const name = file.filename.split('/').pop() ?? file.filename;
  const patch = file.patch
    ? file.patch.split('\n').slice(0, 45).join('\n')
    : '_File too large to display here. Download via the Files button._';

  return (
    `**File ${index + 1} of ${total}**\n` +
    `${statusIcon(file.status)} **${statusLabel(file.status)}** · \`${name}\`\n` +
    `📂 \`${file.filename}\`\n` +
    `➕ ${file.additions} · ➖ ${file.deletions}\n\n` +
    `\`\`\`diff\n${patch.slice(0, 3200)}\n\`\`\``
  );
}

export function formatFileListPage(files: string[], page: number, pageSize: number): string {
  const total = Math.ceil(files.length / pageSize);
  const slice = files.slice(page * pageSize, (page + 1) * pageSize);
  const lines = slice.map((f, i) => `${page * pageSize + i + 1}. \`${f}\``).join('\n');
  return `**Page ${page + 1} of ${total}** · ${files.length} file(s)\n\n${lines}`;
}
