export class Table {
  private head: string[];
  private colWidths: number[];
  private rows: string[][] = [];

  constructor(options: { head: string[]; colWidths: number[]; wordWrap?: boolean }) {
    this.head = options.head;
    this.colWidths = options.colWidths;
  }

  push(row: string[]) {
    this.rows.push(row);
  }

  toString(): string {
    const wrapCell = (text: string, width: number): string[] => {
      const colWidth = Math.max(1, width);
      const cleanText = String(text ?? '').replace(/\r?\n/g, ' ');
      const lines: string[] = [];
      let i = 0;
      while (i < cleanText.length) {
        let chunk = cleanText.substring(i, i + colWidth);
        if (chunk.length < colWidth) {
          lines.push(chunk.padEnd(colWidth));
          break;
        }
        const spaceIdx = chunk.lastIndexOf(' ');
        if (spaceIdx > 0) {
          chunk = chunk.substring(0, spaceIdx);
          lines.push(chunk.padEnd(colWidth));
          i += spaceIdx + 1;
        } else {
          lines.push(chunk);
          i += colWidth;
        }
      }
      if (lines.length === 0) {
        lines.push(''.padEnd(colWidth));
      }
      return lines;
    };

    const buildBorder = (char: string, corner: string): string => {
      return corner + this.colWidths.map((w) => char.repeat(w + 2)).join(corner) + corner;
    };

    const topBorder = buildBorder('─', '┌');
    const headerSeparator = buildBorder('─', '├');
    const rowSeparator = buildBorder('─', '├');
    const bottomBorder = buildBorder('─', '└');

    const result: string[] = [];
    result.push(topBorder);

    const headerLines = this.head.map((h, i) => wrapCell(h, this.colWidths[i]));
    const maxHeaderLines = Math.max(...headerLines.map((l) => l.length));
    for (let r = 0; r < maxHeaderLines; r++) {
      const rowParts = this.head.map((_, colIdx) => {
        const line = headerLines[colIdx][r] || ''.padEnd(this.colWidths[colIdx]);
        return ` ${line} `;
      });
      result.push(`│${rowParts.join('│')}│`);
    }

    result.push(headerSeparator);

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const cellLines = row.map((cell, colIdx) => wrapCell(cell, this.colWidths[colIdx]));
      const maxLines = Math.max(...cellLines.map((l) => l.length));

      for (let r = 0; r < maxLines; r++) {
        const rowParts = row.map((_, colIdx) => {
          const line = cellLines[colIdx][r] || ''.padEnd(this.colWidths[colIdx]);
          return ` ${line} `;
        });
        result.push(`│${rowParts.join('│')}│`);
      }
      if (i < this.rows.length - 1) {
        result.push(rowSeparator);
      }
    }

    result.push(bottomBorder);
    return result.join('\n');
  }
}

export function parsePositiveInt(val: string, argName: string, defaultVal: number): number {
  if (val === undefined || val === null) return defaultVal;
  const num = parseInt(val, 10);
  if (isNaN(num) || num <= 0) {
    throw new Error(
      `Invalid value for option ${argName}: expected a positive integer, got "${val}"`
    );
  }
  return num;
}
