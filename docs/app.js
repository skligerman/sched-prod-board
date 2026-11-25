import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.getElementById('status');

const rows = new Map(); // incident id -> <li>
const acked = new Set(); // incident ids acked in this session

// R5: viewer's local time zone and locale order (dd/mm for EU locales). Full UTC stays in datetime=.
const fmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function makeRow(i) {
  const li = document.createElement('li');
  li.setAttribute('data-testid', 'incident-row');
  li.dataset.id = i.id;
  li.className = `row ${i.severity}`;

  const id = document.createElement('span');
  id.className = 'id';
  id.textContent = i.id;

  const sev = document.createElement('span');
  sev.className = 'sev';
  sev.textContent = i.severity;

  const what = document.createElement('span');
  what.className = 'what';
  what.textContent = `${i.service} · ${i.region} · ${i.summary}`;

  const time = document.createElement('time');
  time.dateTime = i.openedAt;
  time.textContent = fmt.format(new Date(i.openedAt));

  const action = document.createElement('span');
  action.className = 'action';
  li.append(id, sev, what, time, action);
  setAckState(li, i.id);
  return li;
}

function setAckState(li, id) {
  const action = li.querySelector('.action');
  action.replaceChildren();
  if (acked.has(id)) {
    const mark = document.createElement('span');
    mark.className = 'acked';
    mark.setAttribute('data-testid', 'acked');
    mark.textContent = '✓ acked';
    action.append(mark);
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-testid', 'ack');
    btn.textContent = 'Ack';
    action.append(btn);
  }
}

// R1: newest first. Reuse existing rows so a refresh does not disturb a click in progress.
function render(incidents) {
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const keep = new Set(sorted.map((i) => i.id));
  for (const [id, li] of rows) {
    if (!keep.has(id)) {
      li.remove();
      rows.delete(id);
    }
  }
  sorted.forEach((i, idx) => {
    let li = rows.get(i.id);
    if (!li) {
      li = makeRow(i);
      if (loader.hidden) li.classList.add('new'); // flash only rows that arrive after the first load
      rows.set(i.id, li);
    }
    if (list.children[idx] !== li) list.insertBefore(li, list.children[idx] ?? null);
  });
  empty.hidden = sorted.length > 0;
}

// R2 (product's decision after step 1): Ack asks to confirm, and the confirm names the incident id.
// The confirm lives in the row it was asked for, so a new incident landing above cannot change which id it names.
function askConfirm(li, id) {
  const action = li.querySelector('.action');
  const box = document.createElement('span');
  box.className = 'confirm';
  box.setAttribute('data-testid', 'confirm');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', `Confirm ack of ${id}`);

  const text = document.createElement('span');
  text.textContent = `Ack ${id}?`;

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.setAttribute('data-testid', 'confirm-ack');
  yes.textContent = `Ack ${id}`;

  const no = document.createElement('button');
  no.type = 'button';
  no.setAttribute('data-testid', 'confirm-cancel');
  no.textContent = 'Cancel';

  box.append(text, yes, no);
  action.replaceChildren(box);
  no.focus(); // the safe choice is the default
}

list.addEventListener('click', async (e) => {
  const li = e.target.closest('[data-testid="incident-row"]');
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest('[data-testid="ack"]')) return askConfirm(li, id);
  if (e.target.closest('[data-testid="confirm-cancel"]')) return setAckState(li, id);
  const yes = e.target.closest('[data-testid="confirm-ack"]');
  if (!yes) return;
  yes.disabled = true;
  try {
    await ack(id);
    acked.add(id);
    setAckState(li, id);
    status.textContent = '';
  } catch (err) {
    yes.disabled = false;
    status.textContent = `ack failed: ${err.message}`;
  }
});

// R3 + R4: loader until the first answer, then refresh every 2 s without overlapping requests.
async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    loader.hidden = true;
    if (status.textContent.startsWith('offline')) status.textContent = '';
  } catch (err) {
    status.textContent = `offline, retrying (${err.message})`;
  } finally {
    setTimeout(tick, REFRESH_MS);
  }
}
tick();
