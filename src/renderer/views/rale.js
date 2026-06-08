import { api } from '../api.js';
import { createCard, btn } from '../components/card.js';

// Read-only RALE (Roku Advanced Layout Editor) viewer. Shows the running
// channel's full SceneGraph layer tree and the currently focused node. Refresh
// is the only action — nothing here mutates the device.
export function createRaleView({ initialCollapsed = false, showOverlay = false, detailsWidth } = {}) {
  const refreshBtn = btn('Refresh', { primary: true });
  const selectFocusedBtn = btn('Select Focused');

  // Checkbox: when on, RALE draws its selector overlay around the focused node on
  // the running device. Default off — nothing is drawn on the TV.
  const overlayToggle = document.createElement('label');
  overlayToggle.className = 'rale-overlay-toggle';
  overlayToggle.title = 'Draw the RALE selector overlay around the focused node on the device';
  const overlayCheck = document.createElement('input');
  overlayCheck.type = 'checkbox';
  overlayCheck.checked = !!showOverlay;
  overlayToggle.append(overlayCheck, document.createTextNode('Show on device'));
  overlayCheck.addEventListener('change', () => {
    api.setConfig({ raleShowOverlay: overlayCheck.checked });
    refresh();
  });

  const focusedEl = document.createElement('div');
  focusedEl.className = 'rale-focused';

  const treeEl = document.createElement('div');
  treeEl.className = 'rale-tree';

  const statusEl = document.createElement('div');
  statusEl.className = 'status';

  // Two columns: the layer tree on the left, node details on the right, with a
  // draggable splitter between them. Details defaults to 50% of the width.
  const resizer = document.createElement('div');
  resizer.className = 'rale-resizer';
  resizer.title = 'Drag to resize the details panel';
  resizer.draggable = false;

  const cols = document.createElement('div');
  cols.className = 'rale-cols';
  cols.append(treeEl, resizer, focusedEl);

  const body = document.createElement('div');
  body.append(cols, statusEl);

  const clampFrac = (f) => Math.min(0.85, Math.max(0.15, f));
  let detailsFrac = clampFrac(typeof detailsWidth === 'number' ? detailsWidth : 0.5);
  focusedEl.style.flexBasis = `${detailsFrac * 100}%`;

  let dragging = false;
  resizer.addEventListener('pointerdown', (e) => {
    dragging = true;
    resizer.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = cols.getBoundingClientRect();
    if (rect.width <= 0) return;
    detailsFrac = clampFrac((rect.right - e.clientX) / rect.width);
    focusedEl.style.flexBasis = `${detailsFrac * 100}%`;
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { resizer.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    api.setConfig({ raleDetailsWidth: detailsFrac });
  };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);

  const { element } = createCard({
    id: 'rale',
    title: 'RALE — Layout (read-only)',
    initialCollapsed,
    actions: [overlayToggle, selectFocusedBtn, refreshBtn],
    body,
    // Auto-read whenever the panel is expanded.
    onToggle: (collapsed) => { if (!collapsed) refresh(); }
  });

  let busy = false;
  function setBusy(b) {
    busy = b;
    refreshBtn.disabled = b;
    selectFocusedBtn.disabled = b;
    overlayCheck.disabled = b;
  }

  // Walk the tree along the focused node's index path, collecting every node
  // from the root layer down to (and including) the focused node.
  function pathNodes(tree, path) {
    if (!tree) return [];
    const nodes = [tree];
    let cur = tree;
    for (const idx of path || []) {
      const next = (cur.children || []).find((c) => c.index === idx);
      if (!next) break;
      nodes.push(next);
      cur = next;
    }
    return nodes;
  }

  // Render the right-hand details panel for one node. `data` is the normalized
  // node object ({ subtype, id, boundingRect, fields }); `label` distinguishes
  // the device-focused node from a user-selected one.
  function renderDetails(data, ancestors, label, segments) {
    focusedEl.innerHTML = '';
    if (!data) {
      focusedEl.innerHTML = '<div class="rale-empty">No node selected.</div>';
      return;
    }
    const head = document.createElement('div');
    head.className = 'rale-focused-head';
    const lbl = document.createElement('span');
    lbl.className = 'rale-focused-label';
    lbl.textContent = label || 'Selected';
    head.appendChild(lbl);
    const subtype = document.createElement('span');
    subtype.className = 'rale-node-subtype';
    subtype.textContent = data.subtype;
    head.appendChild(subtype);
    if (data.id) {
      const id = document.createElement('span');
      id.className = 'rale-node-id';
      id.textContent = `#${data.id}`;
      head.appendChild(id);
    }
    focusedEl.appendChild(head);

    // Breadcrumb of the full parent chain: root layer › … › this node.
    if (ancestors && ancestors.length > 1) {
      const crumb = document.createElement('div');
      crumb.className = 'rale-breadcrumb';
      ancestors.forEach((n, i) => {
        if (i > 0) {
          const sep = document.createElement('span');
          sep.className = 'rale-breadcrumb-sep';
          sep.textContent = '›';
          crumb.appendChild(sep);
        }
        const seg = document.createElement('span');
        seg.className = 'rale-breadcrumb-seg';
        if (i === ancestors.length - 1) seg.classList.add('current');
        seg.textContent = n.id ? `${n.subtype}#${n.id}` : n.subtype;
        crumb.appendChild(seg);
      });
      focusedEl.appendChild(crumb);
    }

    const br = data.boundingRect;
    if (br) {
      const rect = document.createElement('div');
      rect.className = 'rale-focused-rect';
      rect.textContent = `x ${fmt(br.x)} · y ${fmt(br.y)} · w ${fmt(br.width)} · h ${fmt(br.height)}`;
      focusedEl.appendChild(rect);
    }

    if (data.fields && data.fields.length) {
      const props = document.createElement('div');
      props.className = 'rale-props';
      // Top-level: show the node's fields only — its SceneGraph children are
      // already in the left tree (don't duplicate them here).
      renderEntries(props, data, Array.isArray(segments) ? segments : [], false);
      focusedEl.appendChild(props);
    }
  }

  // Render a value's fields (and, for drilled-in nodes, its children) as
  // collapsible rows into `container`. `ownerSegments` is the RALE path to the
  // value that owns these entries.
  function renderEntries(container, data, ownerSegments, includeChildren) {
    for (const f of data.fields || []) {
      container.appendChild(makeFieldRow(f, ownerSegments));
    }
    if (includeChildren && data.isNode) {
      for (const c of data.children || []) {
        container.appendChild(makeChildRow(c, ownerSegments));
      }
    }
  }

  function makeFieldRow(f, ownerSegments) {
    return makeExpandable({
      drillable: f.object,
      name: f.key,
      type: f.type,
      value: f.value,
      segments: ownerSegments.concat([{ field: f.key }]),
      // Show children only when drilling into a node value (arrays/assoc arrays
      // expose everything through their "fields").
      includeChildren: f.kind === 'node'
    });
  }

  function makeChildRow(c, ownerSegments) {
    return makeExpandable({
      drillable: true,
      name: c.id ? `${c.subtype} #${c.id}` : c.subtype,
      type: 'node',
      value: c.childCount ? `${c.childCount} child${c.childCount === 1 ? '' : 'ren'}` : '',
      segments: ownerSegments.concat([{ child: c.index }]),
      includeChildren: true
    });
  }

  // A collapsible property row. Object/array/node rows lazily fetch their
  // contents (getNodeData by path) the first time they are expanded.
  function makeExpandable(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'rale-prop';

    const line = document.createElement('div');
    line.className = 'rale-prop-line';

    let box = null;
    let loaded = false;
    let expanded = false;

    const onToggle = async () => {
      expanded = !expanded;
      wrap.classList.toggle('collapsed', !expanded);
      if (!expanded || loaded) return;
      loaded = true;
      box.innerHTML = '<div class="rale-prop-loading">Loading…</div>';
      try {
        const res = await api.raleGetNodeData({ segments: opts.segments });
        box.innerHTML = '';
        if (!res.ok || !res.node) {
          box.innerHTML = `<div class="rale-empty">${res.error || 'No data.'}</div>`;
          return;
        }
        const hasChildren = opts.includeChildren && res.node.isNode && res.node.children.length;
        if (!res.node.fields.length && !hasChildren) {
          box.innerHTML = '<div class="rale-empty">(empty)</div>';
          return;
        }
        renderEntries(box, res.node, opts.segments, opts.includeChildren);
      } catch (err) {
        box.innerHTML = `<div class="rale-empty">${err.message}</div>`;
      }
    };

    if (opts.drillable) {
      const chev = document.createElement('span');
      chev.className = 'rale-prop-toggle';
      chev.innerHTML = '<span class="chevron" aria-hidden="true">▾</span>';
      line.appendChild(chev);
      line.classList.add('drillable');
      line.addEventListener('click', onToggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'rale-prop-spacer';
      line.appendChild(spacer);
    }

    const name = document.createElement('span');
    name.className = 'rale-prop-name';
    name.textContent = opts.name;
    line.appendChild(name);

    if (opts.type) {
      const t = document.createElement('span');
      t.className = 'rale-field-type';
      t.textContent = opts.type;
      line.appendChild(t);
    }
    if (opts.value) {
      const v = document.createElement('span');
      v.className = 'rale-prop-value';
      v.textContent = opts.value;
      line.appendChild(v);
    }

    wrap.appendChild(line);

    if (opts.drillable) {
      box = document.createElement('div');
      box.className = 'rale-prop-children';
      wrap.classList.add('collapsed');
      wrap.appendChild(box);
    }

    return wrap;
  }

  function fmt(n) {
    if (typeof n !== 'number') return String(n ?? '—');
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function countNodes(node) {
    if (!node) return 0;
    let n = 1;
    for (const c of node.children || []) n += countNodes(c);
    return n;
  }

  // --- selection state ---
  let currentTree = null;
  let focusedKey = '';            // path key of the device-focused node
  let selectSeq = 0;              // guards against out-of-order select responses
  const rowByKey = new Map();     // path key -> tree row element
  const keyOf = (path) => path.join('/');

  // Highlight the selected node and its parent chain in the tree, expanding the
  // chain so the node is visible even if it was under collapsed branches.
  function applySelection(path) {
    rowByKey.forEach((row) => row.classList.remove('selected', 'ancestor'));
    for (let i = 0; i < path.length; i += 1) {
      const row = rowByKey.get(keyOf(path.slice(0, i)));
      if (!row) continue;
      row.classList.add('ancestor');
      const li = row.closest('.rale-node');
      if (li) li.classList.remove('collapsed');
      const tog = row.querySelector('.rale-node-toggle');
      if (tog) tog.setAttribute('aria-expanded', 'true');
    }
    const sel = rowByKey.get(keyOf(path));
    if (sel) {
      sel.classList.add('selected');
      sel.scrollIntoView({ block: 'nearest' });
    }
  }

  // Mark which node currently holds focus on the device (the ◉ badge),
  // independent of what is selected for inspection.
  function setFocusedMarker(path) {
    rowByKey.forEach((row) => row.classList.remove('is-focused'));
    const row = rowByKey.get(keyOf(path));
    if (row) row.classList.add('is-focused');
  }

  // Select a node by its index path: highlight it, then fetch + show its data.
  // `selectNode` on the device also moves the overlay to it when "Show on
  // device" is enabled.
  async function selectByPath(path) {
    if (busy) return;
    applySelection(path);
    const label = keyOf(path) === focusedKey ? 'Focused' : 'Selected';
    const seq = ++selectSeq;
    statusEl.textContent = 'Reading node…';
    try {
      const res = await api.raleSelectNode({ path });
      if (seq !== selectSeq) return; // a newer selection superseded this one
      if (!res.ok) {
        statusEl.textContent = `Select failed: ${res.error}`;
        return;
      }
      renderDetails(res.node, pathNodes(currentTree, path), label, path.map((i) => ({ child: i })));
      statusEl.textContent = `${label} node updated.`;
    } catch (err) {
      statusEl.textContent = `Select failed: ${err.message}`;
    }
  }

  // Build one tree node. `path` is this node's index path from the root.
  // `branchPath` is the remaining indices leading to the focused node on this
  // branch (null if not on it), used only to auto-expand down to focus.
  function renderNode(node, path, branchPath, depth) {
    const li = document.createElement('li');
    li.className = 'rale-node';

    const onFocusBranch = branchPath !== null && branchPath.length > 0;
    const hasChildren = node.children && node.children.length > 0;

    // Auto-expand the path from root to the focused node so its parentage is
    // visible; also keep the root level open so the top layers always show.
    // Everything else starts collapsed (expandable on click), like RALE.
    const expanded = depth === 0 || onFocusBranch;

    const row = document.createElement('div');
    row.className = 'rale-node-row';
    row.addEventListener('click', () => selectByPath(path));
    rowByKey.set(keyOf(path), row);

    if (hasChildren) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'rale-node-toggle';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.innerHTML = '<span class="chevron" aria-hidden="true">▾</span>';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation(); // don't select when toggling
        const collapsed = li.classList.toggle('collapsed');
        toggle.setAttribute('aria-expanded', String(!collapsed));
      });
      row.appendChild(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'rale-node-spacer';
      row.appendChild(spacer);
    }

    const subtype = document.createElement('span');
    subtype.className = 'rale-node-subtype';
    subtype.textContent = node.subtype;
    row.appendChild(subtype);

    if (node.id) {
      const id = document.createElement('span');
      id.className = 'rale-node-id';
      id.textContent = `#${node.id}`;
      row.appendChild(id);
    }

    if (hasChildren) {
      const count = document.createElement('span');
      count.className = 'rale-node-count';
      count.textContent = String(node.childCount);
      row.appendChild(count);
    }

    li.appendChild(row);

    if (hasChildren) {
      if (!expanded) li.classList.add('collapsed');
      const ul = document.createElement('ul');
      ul.className = 'rale-node-children';
      const nextIndex = branchPath && branchPath.length ? branchPath[0] : null;
      for (const child of node.children) {
        const childBranch =
          nextIndex !== null && child.index === nextIndex ? branchPath.slice(1) : null;
        ul.appendChild(renderNode(child, [...path, child.index], childBranch, depth + 1));
      }
      li.appendChild(ul);
    }

    return li;
  }

  function renderTree(tree, focusedPath) {
    treeEl.innerHTML = '';
    rowByKey.clear();
    currentTree = tree;
    if (!tree) {
      treeEl.innerHTML = '<div class="rale-empty">No layout data.</div>';
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'rale-tree-root';
    ul.appendChild(renderNode(tree, [], Array.isArray(focusedPath) ? focusedPath : null, 0));
    treeEl.appendChild(ul);
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    statusEl.textContent = 'Reading layout…';
    try {
      const res = await api.readRaleLayout({ showOverlay: overlayCheck.checked });
      if (!res.ok) {
        statusEl.textContent = `Read failed: ${res.error}`;
        return;
      }
      const focusedPath = (res.focused && res.focused.path) || [];
      focusedKey = keyOf(focusedPath);
      renderTree(res.tree, focusedPath);
      setFocusedMarker(focusedPath);
      // Initial selection follows the focused node.
      applySelection(focusedPath);
      renderDetails(res.focused, pathNodes(res.tree, focusedPath), 'Focused', focusedPath.map((i) => ({ child: i })));
      const count = countNodes(res.tree);
      statusEl.textContent = `Layout updated — ${count} layer${count === 1 ? '' : 's'}.`;
    } catch (err) {
      statusEl.textContent = `Read failed: ${err.message}`;
    } finally {
      setBusy(false);
    }
  }

  // Re-query the focused node and select it — without re-reading the whole tree.
  // Useful after moving focus with the Remote panel. Falls back to a full
  // refresh if focus moved to a node not in the currently loaded tree (or the
  // channel restarted and the focused query came back empty).
  async function selectFocused() {
    if (busy) return;
    const seq = ++selectSeq;
    statusEl.textContent = 'Reading focused node…';
    try {
      const res = await api.raleSelectFocused();
      if (seq !== selectSeq) return;
      if (!res.ok) {
        statusEl.textContent = `Select focused failed: ${res.error}`;
        return;
      }
      const focused = res.node;
      const fpath = (focused && focused.path) || [];
      if (!focused || !rowByKey.has(keyOf(fpath))) {
        // Tree is stale for the new focus — reload it (refresh selects focus).
        await refresh();
        return;
      }
      focusedKey = keyOf(fpath);
      setFocusedMarker(fpath);
      applySelection(fpath);
      renderDetails(focused, pathNodes(currentTree, fpath), 'Focused', fpath.map((i) => ({ child: i })));
      statusEl.textContent = 'Selected focused node.';
    } catch (err) {
      statusEl.textContent = `Select focused failed: ${err.message}`;
    }
  }

  refreshBtn.addEventListener('click', refresh);
  selectFocusedBtn.addEventListener('click', selectFocused);

  if (!initialCollapsed) refresh();

  return element;
}
