const STATE_KEY = 'checkers_page_state';

export function savePageState(pageId, extra = {}) {
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify({pageId, ...extra})); } catch(e){}
}

export function loadPageState() {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch(e){ return null; }
}

export function clearPageState() {
  try { sessionStorage.removeItem(STATE_KEY); } catch(e){}
}
