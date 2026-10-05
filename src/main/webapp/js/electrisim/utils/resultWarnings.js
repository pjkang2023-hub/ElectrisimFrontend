// resultWarnings.js - a study's warnings from the backend, shown beside the diagram.
//
// The backend says when it leaves an element out or corrects a value (a VSC with
// no DC bus, a DC network no converter connects); those notes only reached the
// server log. This shows them in a small panel the user can close.

const PANEL_CLASS = 'electrisim-result-warnings';

export function showResultWarnings(warnings, title = 'Load flow notes') {
    const list = (Array.isArray(warnings) ? warnings : []).filter(w => typeof w === 'string' && w.trim());
    document.querySelectorAll(`.${PANEL_CLASS}`).forEach(el => el.remove());
    if (!list.length) return null;
    const panel = document.createElement('div');
    panel.className = PANEL_CLASS;
    panel.setAttribute('role', 'status');
    panel.style.cssText = `
        position: fixed; right: 16px; bottom: 16px; z-index: 9000; max-width: 420px; max-height: 40vh; overflow: auto;
        background: #fff8e1; color: #5d4300; border: 1px solid #f0c36d; border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.18); font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        padding: 10px 12px;
    `;
    const head = document.createElement('div');
    head.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; font-weight:600;';
    head.textContent = `${title} (${list.length})`;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.style.cssText = 'border:none; background:transparent; font-size:18px; line-height:1; cursor:pointer; color:inherit;';
    close.onclick = () => panel.remove();
    head.appendChild(close);
    panel.appendChild(head);
    const ul = document.createElement('ul');
    ul.style.cssText = 'margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px;';
    list.forEach((w) => {
        const li = document.createElement('li');
        li.textContent = w;
        ul.appendChild(li);
    });
    panel.appendChild(ul);
    document.body.appendChild(panel);
    return panel;
}
