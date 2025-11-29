import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body?.id);
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const xmlPath = path.join(process.cwd(), 'public', 'data', 'trashCan.xml');
    const raw = await fs.readFile(xmlPath, 'utf8');

    // Find the <trashCan ... id="<id>"> ... </trashCan> block (non-greedy)
    const trashCanRegex = new RegExp(`<trashCan\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/trashCan>`, 'i');
    const match = raw.match(trashCanRegex);
    if (!match) return NextResponse.json({ error: 'Trashcan not found' }, { status: 404 });

    const inner = match[1];
    const statusRegex = /(<status>)([\s\S]*?)(<\/status>)/i;
    let newInner: string;
    if (statusRegex.test(inner)) {
      newInner = inner.replace(statusRegex, (_m, p1, _p2, p3) => `${p1}vide${p3}`);
    } else {
      // insert status before end, try to keep indentation
      const indentMatch = inner.match(/\n([ \t]*)[^\n]*$/);
      const indent = indentMatch ? indentMatch[1] : '    ';
      newInner = inner + `\n${indent}<status>vide</status>\n`;
    }

    const updated = raw.replace(trashCanRegex, (m, _inner) => m.replace(inner, newInner));

    await fs.writeFile(xmlPath, updated, 'utf8');

    return NextResponse.json({ ok: true, id });
  } catch (err: any) {
    console.error('Failed to update trashCan.xml', err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
