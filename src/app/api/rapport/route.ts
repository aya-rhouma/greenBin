// Import the server-side helper explicitly (include extension) to avoid resolving to the client `rapport.tsx` file.
import { saveReportXml } from '../../gestion_tournees/rapport.server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await saveReportXml(body);
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('/api/rapport error', err);
    return new Response(JSON.stringify({ error: err?.message || 'Erreur serveur' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
