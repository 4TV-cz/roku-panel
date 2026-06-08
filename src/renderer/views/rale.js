import { api } from '../api.js';
import { createCard, btn } from '../components/card.js';

// Read-only RALE (Roku Advanced Layout Editor) viewer. Shows the running
// channel's full SceneGraph layer tree and the currently focused node. Refresh
// is the only action — nothing here mutates the device.
export function createRaleView({ initialCollapsed = false, showOverlay = false, detailsWidth } = {}) {
  const refreshBtn = btn('Refresh', { primary: true });

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
    actions: [overlayToggle, refreshBtn],
    body,
    // Auto-read whenever the panel is expanded.
    onToggle: (collapsed) => { if (!collapsed) refresh(); }
  });

  let busy = false;
  function setBusy(b) {
    busy = b;
    refreshBtn.disabled = b;
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
  function renderDetails(data, ancestors, label) {
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
      const grid = document.createElement('dl');
      grid.className = 'rale-fields';
      for (const f of data.fields) {
        const dt = document.createElement('dt');
        dt.textContent = f.key;
        const dd = document.createElement('dd');
        dd.textContent = f.value;
        grid.append(dt, dd);
      }
      focusedEl.appendChild(grid);
    }
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

  // Highlight the selected node and its parent chain in the tree.
  function applySelection(path) {
    rowByKey.forEach((row) => row.classList.remove('selected', 'ancestor'));
    for (let i = 0; i < path.length; i += 1) {
      const row = rowByKey.get(keyOf(path.slice(0, i)));
      if (row) row.classList.add('ancestor');
    }
    const sel = rowByKey.get(keyOf(path));
    if (sel) {
      sel.classList.add('selected');
      sel.scrollIntoView({ block: 'nearest' });
    }
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
      renderDetails(res.node, pathNodes(currentTree, path), label);
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

    const isFocused = branchPath !== null && branchPath.length === 0;
    const onFocusBranch = branchPath !== null && branchPath.length > 0;
    const hasChildren = node.children && node.children.length > 0;

    // Auto-expand the path from root to the focused node so its parentage is
    // visible; also keep the root level open so the top layers always show.
    // Everything else starts collapsed (expandable on click), like RALE.
    const expanded = depth === 0 || onFocusBranch;

    const row = document.createElement('div');
    row.className = 'rale-node-row';
    if (isFocused) row.classList.add('is-focused');
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
      // Initial selection follows the focused node.
      applySelection(focusedPath);
      renderDetails(res.focused, pathNodes(res.tree, focusedPath), 'Focused');
      const count = countNodes(res.tree);
      statusEl.textContent = `Layout updated — ${count} layer${count === 1 ? '' : 's'}.`;
    } catch (err) {
      statusEl.textContent = `Read failed: ${err.message}`;
    } finally {
      setBusy(false);
    }
  }

  refreshBtn.addEventListener('click', refresh);

  if (!initialCollapsed) refresh();

  return element;
}
