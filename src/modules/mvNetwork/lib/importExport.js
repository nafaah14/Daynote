import { migrate } from './electricalModel';

/** Filename stamp matching v39's export convention: mv-network_YYYY-MM-DD_HHMM.json */
function stampName() {
  const d = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  return `mv-network_${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}.json`;
}

/** Triggers a browser download of the network as JSON — the same shape v39
 *  writes, so a file round-trips between the standalone app and this module. */
export function exportNetwork(net) {
  const payload = { ...net, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = stampName();
  a.click();
  URL.revokeObjectURL(a.href);
  return a.download;
}

/** Parses and migrates an imported network file. Throws with a user-facing
 *  message if the file doesn't look like a network export. */
export function parseImportedNetwork(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('Could not read that file — is it a valid export?');
  }
  if (!data.nodes || !data.cables || !data.feeders) {
    throw new Error('That file doesn\'t look like an MV Network export.');
  }
  return migrate(data);
}
