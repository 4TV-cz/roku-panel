import { api } from '../api.js';
import { createCard, btn, chip } from '../components/card.js';

// Port of the IBM Output Colorizer grammar (log.tmLanguage) — per-token
// highlighting matching VS Code Dark+ scope colors. Order matters: alternatives
// are tried left-to-right at each position, so earlier rules win on ties.
const TOKEN_RULES = [
  // string.quoted — double / single quoted strings
  ['tk-string',     '"[^"\\n]*"'],
  ['tk-string',     "'[^'\\n]*'"],
  // support.class — GUID
  ['tk-class',      '\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b'],
  // markup.bold — email
  ['tk-bold',       '[^\\s<>()\\[\\]]+@[^\\s<>()\\[\\]]+\\.[^\\s<>()\\[\\]]+'],
  // invalid — Exception / Error / Failure / Fail (with optional dotted prefix)
  ['tk-invalid',    '\\b[a-zA-Z0-9_.]*(?:Exception|Error|Failure|Fail)\\b'],
  // constant.numeric — dates MM/DD/YY, YYYY/MM/DD, DD/MM/YY (simplified, separator any of / - .)
  ['tk-numeric',    '\\b\\d{4}[/.\\-]\\d{1,2}[/.\\-]\\d{1,2}\\b'],
  ['tk-numeric',    '\\b\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}\\b'],
  // constant.numeric — time HH:MM(:SS)(:millis)( AM/PM)( tz)
  ['tk-numeric',    '\\b\\d{1,2}:\\d{2}(?::\\d{2})?(?:[:.]\\d{1,4})?(?:\\s?[ap]m?)?(?:\\s?[+\\-]?\\d+)?\\b'],
  // storage — URI / URL
  ['tk-storage',    '\\b[a-z][a-z0-9+.\\-]*:\\/\\/[^\\s)\\]}"\\\']+'],
  // constant.numeric — hex (0x prefixed only; matching bare hex words from the grammar is too greedy)
  ['tk-numeric',    '\\b0x[0-9a-f]+\\b'],
  // constant.numeric — decimals / integers
  ['tk-numeric',    '\\b\\d+(?:\\.\\d+)?\\b'],
  // support.type — namespaces (dotted identifiers like beacon.signal, com.foo.bar)
  ['tk-type',       '\\b[a-z_][a-z0-9_\\-]*(?:\\.[a-z0-9_\\-]+){1,}\\b'],
  // invalid.illegal — bare bad-news words
  ['tk-illegal',    '\\b(?:Down|Error|Failure|Fail|Fatal|false)\\b'],
  // keyword — info / true / log
  ['tk-keyword',    '\\b(?:hint|info|information|true|log)\\b'],
  // invalid.deprecated — warning / debug / null / undefined / NaN
  ['tk-deprecated', '\\b(?:warning|warn|test|debug|null|undefined|NaN)\\b'],
  // support.function — local
  ['tk-function',   '\\blocal\\b'],
  // comment.line — server / running / remote
  ['tk-comment',    '\\b(?:server|running|remote)\\b'],
  // comment.line — npm-style arrows and tree drawing
  ['tk-comment',    '-+>|├─+|└─+']
];

// Each rule's pattern is wrapped in (...) so a single combined regex tells us
// which rule matched via the first non-undefined capture group.
const COMBINED_RE = new RegExp(TOKEN_RULES.map(([, p]) => `(${p})`).join('|'), 'gi');

function tokenize(text) {
  const out = [];
  COMBINED_RE.lastIndex = 0;
  let lastEnd = 0;
  let m;
  while ((m = COMBINED_RE.exec(text))) {
    if (m.index > lastEnd) out.push({ cls: null, t: text.slice(lastEnd, m.index) });
    let cls = null;
    for (let i = 1; i < m.length; i++) {
      if (m[i] !== undefined) { cls = TOKEN_RULES[i - 1][0]; break; }
    }
    out.push({ cls, t: m[0] });
    lastEnd = m.index + m[0].length;
    if (m[0].length === 0) COMBINED_RE.lastIndex++;
  }
  if (lastEnd < text.length) out.push({ cls: null, t: text.slice(lastEnd) });
  return out;
}

function appendTokens(parent, text) {
  for (const tok of tokenize(text)) {
    if (tok.cls) {
      const span = document.createElement('span');
      span.className = tok.cls;
      span.textContent = tok.t;
      parent.appendChild(span);
    } else if (tok.t) {
      parent.appendChild(document.createTextNode(tok.t));
    }
  }
}

function renderTokens(el, text) {
  el.textContent = '';
  appendTokens(el, text);
}

// --- inline JSON folding ---

const JSON_MIN_LEN = 30;  // skip tiny JSONs that read fine inline

function findMatchingBrace(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : '';
  if (!close) return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let j = start; j < text.length; j++) {
    const c = text[j];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function findJsonRanges(text) {
  const ranges = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      const end = findMatchingBrace(text, i);
      if (end > i) {
        const sub = text.slice(i, end + 1);
        if (sub.length >= JSON_MIN_LEN) {
          try {
            const parsed = JSON.parse(sub);
            const isObj = parsed !== null && typeof parsed === 'object';
            const hasContent = isObj && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0);
            if (hasContent) {
              ranges.push({ start: i, end: end + 1, parsed });
              i = end + 1;
              continue;
            }
          } catch {}
        }
      }
    }
    i++;
  }
  return ranges;
}

function createJsonFold(rawText, parsed) {
  const isArr = Array.isArray(parsed);
  const size = isArr ? parsed.length : Object.keys(parsed).length;
  const kind = isArr ? '[…]' : '{…}';
  const noun = isArr ? 'item' : 'key';

  const details = document.createElement('details');
  details.className = 'telnet-json';

  const summary = document.createElement('summary');
  summary.className = 'json-summary';
  const label = document.createElement('span');
  label.className = 'json-label';
  label.textContent = `${kind} ${size} ${noun}${size === 1 ? '' : 's'}`;
  summary.appendChild(label);

  const body = document.createElement('pre');
  body.className = 'json-body';
  appendTokens(body, JSON.stringify(parsed, null, 2));

  details.appendChild(summary);
  details.appendChild(body);
  return details;
}

function renderLineWithFolds(el, text) {
  el.textContent = '';
  const ranges = findJsonRanges(text);
  if (!ranges.length) {
    appendTokens(el, text);
    return;
  }
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) appendTokens(el, text.slice(cursor, r.start));
    el.appendChild(createJsonFold(text.slice(r.start, r.end), r.parsed));
    cursor = r.end;
  }
  if (cursor < text.length) appendTokens(el, text.slice(cursor));
}

// Backtrace folding helpers
const TRACE_START_RE = /^(?:\*+\s*)?Backtrace:\s*$/i;
function isTraceFrameLine(text) {
  const t = text.trim();
  if (t === '') return true;                   // blanks inside trace stay inside
  if (/^#\d+\b/.test(t)) return true;          // #0  Function init()
  if (/^file\/line:/i.test(t)) return true;    //    file/line: pkg:/...
  if (/^pkg:\//i.test(t)) return true;         // bare pkg path continuation
  return false;
}
function isFrameHeader(text) {
  return /^#\d+\b/.test(text.trim());
}

export function createTelnetView({ initialCollapsed = false } = {}) {
  const stateEl = chip('disconnected', 'telnet-state');

  const filterInput = document.createElement('input');
  filterInput.type = 'text';
  filterInput.className = 'input telnet-filter';
  filterInput.placeholder = 'filter…';
  filterInput.autocomplete = 'off';

  const toggleBtn = btn('Open', { primary: true });
  const checkBtn = btn('Check');
  const copyBtn = btn('Copy');
  const clearBtn = btn('Clear');

  const consoleEl = document.createElement('div');
  consoleEl.className = 'telnet-console';

  const { element } = createCard({
    id: 'telnet',
    title: 'Telnet',
    initialCollapsed,
    actions: [stateEl, filterInput, toggleBtn, checkBtn, copyBtn, clearBtn],
    body: consoleEl
  });

  let isOpen = false;
  let filterText = '';
  let pendingLine = null;
  let traceGroup = null;  // { detailsEl, summaryEl, frameCount, headerRaw }

  // The whole card has draggable=true (set by app.js for reorder DnD).
  // Chromium decides "drag vs select" at mousedown time, so preventing
  // dragstart later is too late — selection never starts. Toggle the
  // card's draggable off while a press is active inside the console.
  consoleEl.addEventListener('mousedown', () => { element.draggable = false; });
  document.addEventListener('mouseup', () => { element.draggable = true; });
  consoleEl.addEventListener('dragstart', (e) => e.preventDefault());

  function lineMatches(text) {
    if (!filterText) return true;
    return text.toLowerCase().includes(filterText);
  }

  function expandMatchingJsonFolds(scope) {
    if (!filterText) return;
    scope.querySelectorAll('.telnet-json').forEach((details) => {
      const body = details.querySelector('.json-body');
      if (body && lineMatches(body.textContent)) details.open = true;
    });
  }

  function applyFilterToExisting() {
    for (const child of consoleEl.children) {
      if (child.classList.contains('telnet-trace')) {
        let anyMatch = false;
        // Match the trace's stored header text (e.g. "Backtrace:")
        if (lineMatches(child._rawHeader || '')) anyMatch = true;
        // Match each frame line inside the details
        const frames = child.querySelectorAll('.telnet-line');
        frames.forEach((line) => {
          const m = lineMatches(line._raw || line.textContent);
          line.style.display = m ? '' : 'none';
          if (m) anyMatch = true;
        });
        child.style.display = anyMatch ? '' : 'none';
        // When filtering, expand any trace that contains a hit
        if (filterText && anyMatch) {
          child.open = true;
          expandMatchingJsonFolds(child);
        }
      } else if (child.classList.contains('telnet-line')) {
        const matches = lineMatches(child._raw || child.textContent);
        child.style.display = matches ? '' : 'none';
        if (matches) expandMatchingJsonFolds(child);
      }
    }
  }

  function startTraceGroup(originalLineEl, headerText) {
    const details = document.createElement('details');
    details.className = 'telnet-trace';
    details.open = true;
    details._rawHeader = headerText;

    const summary = document.createElement('summary');
    summary.className = 'telnet-line tl-trace-summary';
    renderTokens(summary, headerText);
    summary._raw = headerText;

    consoleEl.replaceChild(details, originalLineEl);
    details.appendChild(summary);

    traceGroup = { detailsEl: details, summaryEl: summary, frameCount: 0, headerRaw: headerText };
  }

  function finalizeTraceGroup() {
    if (!traceGroup) return;
    const { summaryEl, frameCount, detailsEl } = traceGroup;
    const label = `${traceGroup.headerRaw} ${frameCount} frame${frameCount === 1 ? '' : 's'} (click to expand)`;
    summaryEl.textContent = '';
    renderTokens(summaryEl, label);
    detailsEl.open = false;
    traceGroup = null;
  }

  function finalizeLine(el) {
    const text = el._raw || '';

    // Re-render with inline JSON folds now that the line is complete.
    // Cheap pre-check so plain lines stay on the streaming-only render path.
    if (text.includes('{') || text.includes('[')) {
      renderLineWithFolds(el, text);
    }

    if (!traceGroup && TRACE_START_RE.test(text.trim())) {
      startTraceGroup(el, text);
      return;
    }
    if (traceGroup) {
      if (isTraceFrameLine(text)) {
        if (isFrameHeader(text)) traceGroup.frameCount++;
      } else {
        // Not a frame line — move it back out to the console root and close the group
        consoleEl.appendChild(el);
        finalizeTraceGroup();
      }
    }
  }

  function ensurePendingLine() {
    if (!pendingLine) {
      pendingLine = document.createElement('div');
      pendingLine.className = 'telnet-line';
      pendingLine._raw = '';
      const parent = traceGroup ? traceGroup.detailsEl : consoleEl;
      parent.appendChild(pendingLine);
    }
    return pendingLine;
  }

  function appendToLine(el, more) {
    el._raw = (el._raw || '') + more;
    renderTokens(el, el._raw);
    el.style.display = lineMatches(el._raw) ? '' : 'none';
  }

  function collectCopyText() {
    const lines = [];
    for (const child of consoleEl.children) {
      if (child.style.display === 'none') continue;
      if (child.classList.contains('telnet-trace')) {
        lines.push(child._rawHeader || '');
        child.querySelectorAll('.telnet-line:not(summary)').forEach((line) => {
          if (line.style.display !== 'none') lines.push(line._raw || line.textContent);
        });
      } else if (child.classList.contains('telnet-line')) {
        lines.push(child._raw || child.textContent);
      }
    }
    return lines.join('\n');
  }

  function setState(open, label) {
    isOpen = open;
    toggleBtn.textContent = open ? 'Close' : 'Open';
    toggleBtn.classList.toggle('primary', !open);
    stateEl.textContent = label ?? (open ? 'connected' : 'disconnected');
    stateEl.classList.toggle('connected', open);
  }

  toggleBtn.addEventListener('click', async () => {
    if (isOpen) {
      await api.closeTelnet();
      return;
    }
    const res = await api.openTelnet();
    if (!res.ok) setState(false, `error: ${res.error}`);
  });

  clearBtn.addEventListener('click', () => {
    consoleEl.textContent = '';
    pendingLine = null;
    traceGroup = null;
  });

  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    setState(isOpen, 'checking port…');
    try {
      const res = await api.checkTelnet();
      if (!res.ok) {
        setState(isOpen, `check failed: ${res.error}`);
        return;
      }
      const target = `${res.host}:${res.port}`;
      let label;
      if (res.byUs) label = `${target} — in use by this app`;
      else if (res.inUse) label = `${target} — in use by another client`;
      else if (!res.reachable) label = `${target} — unreachable${res.error ? ` (${res.error})` : ''}`;
      else label = `${target} — free`;
      setState(isOpen, label);
    } catch (err) {
      setState(isOpen, `check failed: ${err.message}`);
    } finally {
      checkBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', async () => {
    const selection = window.getSelection();
    const selText = selection ? selection.toString() : '';
    const anchor = selection?.anchorNode;
    let text;
    if (selText && anchor && consoleEl.contains(anchor.nodeType === 1 ? anchor : anchor.parentNode)) {
      text = selText;
    } else {
      text = collectCopyText();
    }
    const prev = stateEl.textContent;
    try {
      const res = await api.copyToClipboard(text);
      setState(isOpen, res?.ok ? `copied ${text.length} chars` : 'copy failed');
    } catch (err) {
      setState(isOpen, `copy failed: ${err.message}`);
    }
    setTimeout(() => setState(isOpen, prev), 1500);
  });

  filterInput.addEventListener('input', () => {
    filterText = filterInput.value.toLowerCase();
    applyFilterToExisting();
  });

  api.onTelnetData((chunk) => {
    const nearBottom =
      consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 40;
    const normalized = chunk.replace(/\r\n|\r/g, '\n');
    const parts = normalized.split('\n');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast && part === '' && pendingLine === null) continue;
      const line = ensurePendingLine();
      appendToLine(line, part);
      if (!isLast) {
        finalizeLine(line);
        pendingLine = null;
      }
    }
    if (nearBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
  });

  api.onTelnetStatus((evt) => {
    if (evt.status === 'open') setState(true, `connected ${evt.host}`);
    else if (evt.status === 'closed') {
      pendingLine = null;
      traceGroup = null;
      setState(false);
    } else if (evt.status === 'rejected') {
      setState(false, 'rejected (console already in use)');
    } else if (evt.status === 'error') {
      setState(false, `error: ${evt.message}`);
    }
  });

  return element;
}
