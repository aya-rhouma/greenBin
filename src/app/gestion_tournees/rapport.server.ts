import { promises as fs } from 'fs';
import path from 'path';

/**
 * Save a report payload to `public/data/rapport.xml` by inserting a new <rapport> element.
 * Expects body to contain at least: { idTournee?, vehicule?, date?, chef?, presentEmployees: string[], absentEmployees: string[], selectedTrashcans: number[] }
 */
export async function saveReportXml(body: any) {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const filePath = path.join(dataDir, 'rapport.xml');

  await fs.mkdir(dataDir, { recursive: true });

  let xml = '';
  try {
    xml = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    // if file doesn't exist, create a base structure
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rapports>\n</rapports>\n`;
  }

  // find next id
  const idMatches = Array.from(xml.matchAll(/<rapport\s+id="(\d+)"/g)).map(m => Number(m[1]));
  const nextId = (idMatches.length ? Math.max(...idMatches) : 0) + 1;

  const date = body?.date || new Date().toISOString().slice(0, 10);
  const tourneeId = body?.idTournee || '';

  // chef
  const chef = body?.chef || null;
  const chefIdAttr = chef?.id ? ` id="${chef.id}"` : '';

  // employees: present and absent
  const present: string[] = Array.isArray(body?.presentEmployees) ? body.presentEmployees : [];
  const absent: string[] = Array.isArray(body?.absentEmployees) ? body.absentEmployees : [];

  // selected trashcans
  const trashIds: number[] = Array.isArray(body?.selectedTrashcans) ? body.selectedTrashcans.map((v: any) => Number(v)) : [];

  // helper to try to lookup user details from users.xml
  async function lookupUserByName(name: string) {
    const usersPath = path.join(process.cwd(), 'public', 'data', 'users.xml');
    try {
      const raw = await fs.readFile(usersPath, 'utf8');
      // parse user blocks and match by id attribute, login, nom or prenom
      const userMatches = Array.from(raw.matchAll(/<user[^>]*id="(\d+)"[^>]*>[\s\S]*?<login>(.*?)<\/login>[\s\S]*?<nom>(.*?)<\/nom>[\s\S]*?<prenom>(.*?)<\/prenom>[\s\S]*?<\/user>/g));
      for (const m of userMatches) {
        const id = m[1].trim();
        const login = (m[2] || '').trim();
        const nom = (m[3] || '').trim();
        const prenom = (m[4] || '').trim();
        if (String(id) === String(name)) return { id, nom, prenom };
        if ([login, nom, prenom].some(s => s && s.toLowerCase() === name.toLowerCase())) {
          return { id, nom, prenom };
        }
      }
    } catch (err) {
      // ignore
    }
    return null;
  }

  // build employees xml
  let employeesXml = '';
  employeesXml += `        <employees>\n`;
  if (chef && chef?.id) {
    // Always emit only the id as attribute for chefTourne
    employeesXml += `            <chefTourne${chefIdAttr}/>\n`;
  } else {
    employeesXml += `            <chefTourne/>\n`;
  }

  employeesXml += `            <ouvriers>\n`;

  for (const name of present) {
    const u = await lookupUserByName(name).catch(()=>null);
    const idAttr = u?.id ? ` id="${escapeXml(String(u.id))}"` : '';
    const nom = u?.nom || name;
    const prenom = u?.prenom || '';
    employeesXml += `                <ouvrier${idAttr}>\n`;
    employeesXml += `                    <nom>${escapeXml(String(nom))}</nom>\n`;
    employeesXml += `                    <prenom>${escapeXml(String(prenom))}</prenom>\n`;
    employeesXml += `                    <status>present</status>\n`;
    employeesXml += `                </ouvrier>\n`;
  }

  for (const name of absent) {
    const u = await lookupUserByName(name).catch(()=>null);
    const idAttr = u?.id ? ` id="${escapeXml(String(u.id))}"` : '';
    const nom = u?.nom || name;
    const prenom = u?.prenom || '';
    employeesXml += `                <ouvrier${idAttr}>\n`;
    employeesXml += `                    <nom>${escapeXml(String(nom))}</nom>\n`;
    employeesXml += `                    <prenom>${escapeXml(String(prenom))}</prenom>\n`;
    employeesXml += `                    <status>absent</status>\n`;
    employeesXml += `                </ouvrier>\n`;
  }

  employeesXml += `            </ouvriers>\n`;
  employeesXml += `        </employees>\n`;

  // build dechetsCollecte
  // selectedTrashcans may be an array of numbers or objects { id, quantite }
  let dechetsXml = `        <dechetsCollecte>\n`;
  const rawTrash = Array.isArray(body?.selectedTrashcans) ? body.selectedTrashcans : [];
  for (const item of rawTrash) {
    let id: number | null = null;
    let quantite: number | null = null;
    if (typeof item === 'number') {
      id = Number(item);
      quantite = 0;
    } else if (item && typeof item === 'object') {
      id = Number(item.id);
      quantite = item.quantite != null ? Number(item.quantite) : 0;
    }
    if (!isNaN(Number(id))) {
      const q = isNaN(Number(quantite)) ? 0 : Number(quantite);
      dechetsXml += `            <trashCan id="${id}" quantite="${q}"/>\n`;
    }
  }
  dechetsXml += `        </dechetsCollecte>\n`;

  // assemble rapport block
  const rapportBlock = [
    `    <rapport id="${nextId}"> <!-- id: key -->`,
    `        <date>${escapeXml(String(date))}</date>`,
    tourneeId ? `        <tournee id="${escapeXml(String(tourneeId))}"/>` : `        <tournee/>`,
    employeesXml.trimEnd(),
    dechetsXml.trimEnd(),
    `    </rapport>\n`,
  ].join('\n') + '\n';

  // insert before closing </rapports>
  const closingTag = /<\/rapports>\s*$/i;
  let newXml = '';
  if (closingTag.test(xml)) {
    newXml = xml.replace(closingTag, rapportBlock + '</rapports>\n');
  } else {
    newXml = xml + '\n' + rapportBlock + '</rapports>\n';
  }

  await fs.writeFile(filePath, newXml, 'utf8');

  return { message: 'Rapport enregistré', id: nextId };
}

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export default saveReportXml;
