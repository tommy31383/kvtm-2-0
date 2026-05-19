// Debug overlay — visible log without DevTools.
// Captures console.log/warn/error AND exposes dbg.log/ok/err for explicit use.

type Level = 'info' | 'ok' | 'err';

class DebugLogger {
  private logEl: HTMLDivElement | null = null;
  private maxRows = 200;
  private buffer: { level: Level; msg: string }[] = [];

  init() {
    this.logEl = document.getElementById('debug-log') as HTMLDivElement;
    const overlay = document.getElementById('debug-overlay');
    const toggle  = document.getElementById('debug-toggle');
    const clearBtn = document.getElementById('debug-clear');
    if (toggle && overlay) {
      toggle.addEventListener('click', () => {
        overlay.classList.toggle('collapsed');
        toggle.textContent = overlay.classList.contains('collapsed') ? '▲' : '▼';
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.buffer = [];
        if (this.logEl) this.logEl.innerHTML = '';
      });
    }
    // Patch console
    const orig = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    console.log = (...args: any[]) => { orig.log(...args); this.log('info', formatArgs(args)); };
    console.info = (...args: any[]) => { orig.info(...args); this.log('info', formatArgs(args)); };
    console.warn = (...args: any[]) => { orig.warn(...args); this.log('err',  formatArgs(args)); };
    console.error = (...args: any[]) => { orig.error(...args); this.log('err',  formatArgs(args)); };

    // Catch global errors
    window.addEventListener('error', ev => {
      this.log('err', `[uncaught] ${ev.message} @ ${ev.filename}:${ev.lineno}`);
    });
    window.addEventListener('unhandledrejection', ev => {
      this.log('err', `[promise reject] ${ev.reason?.message ?? ev.reason}`);
    });

    // Flush early buffer (logs from before init)
    this.buffer.forEach(b => this.append(b.level, b.msg));
  }

  log(level: Level, msg: string) {
    if (!this.logEl) {
      this.buffer.push({ level, msg });
      return;
    }
    this.append(level, msg);
  }

  ok(msg: string) { this.log('ok', msg); }
  err(msg: string) { this.log('err', msg); }
  info(msg: string) { this.log('info', msg); }

  private append(level: Level, msg: string) {
    if (!this.logEl) return;
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    const row = document.createElement('div');
    row.className = `log-row log-${level}`;
    row.innerHTML = `<span class="log-time">${hh}:${mm}:${ss}</span>${escapeHtml(msg)}`;
    this.logEl.appendChild(row);
    // Trim
    while (this.logEl.children.length > this.maxRows) {
      this.logEl.removeChild(this.logEl.firstChild!);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}

function formatArgs(args: any[]): string {
  return args.map(a => {
    if (a === null) return 'null';
    if (a === undefined) return 'undefined';
    if (typeof a === 'string') return a;
    if (typeof a === 'number' || typeof a === 'boolean') return String(a);
    if (a instanceof Error) return `[Error: ${a.message}${a.stack ? '\n' + a.stack.split('\n').slice(0, 3).join('\n') : ''}]`;
    if (typeof Event !== 'undefined' && a instanceof Event) return `[Event: ${a.type} on ${(a.target as any)?.id ?? a.target?.constructor?.name ?? '?'}]`;
    if (typeof HTMLElement !== 'undefined' && a instanceof HTMLElement) return `[<${a.tagName} id=${a.id || '∅'}>]`;
    if (Array.isArray(a)) return `[Array(${a.length})]`;
    try {
      const s = JSON.stringify(a);
      if (s === '{}' || s === undefined) return `[${a.constructor?.name ?? 'object'}: ${Object.keys(a).join(',') || 'empty'}]`;
      return s.length > 200 ? s.slice(0, 200) + '...' : s;
    } catch { return `[${a.constructor?.name ?? 'object'}]`; }
  }).join(' ');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const dbg = new DebugLogger();
