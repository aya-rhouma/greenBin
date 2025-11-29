import fs from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

type RawTrash = any;

export async function getTrashCans(): Promise<Array<{ id: number; name: string; lat: number; lng: number; status: 'full' | 'half' | 'empty' }>> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'trashCan.xml');
  const xml = await fs.readFile(filePath, 'utf8');

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(xml) as { trashCans?: { trashCan?: RawTrash } };

  const raw = parsed?.trashCans?.trashCan ?? [];
  const items = Array.isArray(raw) ? raw : [raw];

  const mapped = items.map((it: any) => {
    const id = parseInt(it['@_id'] ?? (it.id as any) ?? '0', 10);
    const adresse = it.lieu?.adresse ?? '';
    const lat = parseFloat(it.lieu?.coordonnees?.latitude ?? it.lieu?.coordonnees?.lat ?? 0);
    const lng = parseFloat(it.lieu?.coordonnees?.longitude ?? it.lieu?.coordonnees?.lng ?? 0);
    const statusRaw = String(it.status ?? '').toLowerCase();
    let status: 'full' | 'half' | 'empty' = 'full';
    if (statusRaw.includes('vide')) status = 'empty';
    else if (statusRaw.includes('moitie') || statusRaw.includes('moitié') || statusRaw.includes('moitié')) status = 'half';
    else status = 'full';

    return {
      id: Number.isNaN(id) ? 0 : id,
      name: typeof adresse === 'object' ? String(adresse['#text'] ?? '') : String(adresse ?? ''),
      lat: Number.isNaN(lat) ? 0 : lat,
      lng: Number.isNaN(lng) ? 0 : lng,
      status,
    };
  });

  return mapped;
}
