import { NextResponse } from 'next/server';
import { getTrashCans } from '../../gestion_tournees/gestion_ts_collectes/trashCans';

export async function GET() {
  try {
    const data = await getTrashCans();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load trash cans' }, { status: 500 });
  }
}
