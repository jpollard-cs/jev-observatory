let token;
export function setToken(value) { token = value; }
export async function api(route, data) {
  const response = await fetch('/api/' + route, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench-Token': token }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'Workspace request failed');
  return result;
}
