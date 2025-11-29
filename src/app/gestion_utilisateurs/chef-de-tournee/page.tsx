"use client";

import { useEffect, useState } from 'react';
import Image from 'next/image';

import dynamic from 'next/dynamic';

const TrashMapChef = dynamic(() => import('../../gestion_tournees/gestion_ts_collectes/TrashMapChef'), { ssr: false });

export default function ChefDeTournee() {
  const [user, setUser] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('user');
      if (raw) setUser(JSON.parse(raw));
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (user) {
      setShowPopup(true);
      const t = setTimeout(() => setShowPopup(false), 5000);
      return () => clearTimeout(t);
    }
  }, [user]);

  return (
    <div>
      <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #eee'}}>
        <div style={{fontSize: 20, fontWeight: 700}}>GreenBin</div>
        <div style={{fontSize: 50, fontWeight: 500}}>Dashboard Chef tournée</div>
        <div>
          <Image src="/profile_pic.png" alt="profile" width={48} height={48} style={{borderRadius: '50%'}} />
        </div>
      </header>

      {/* popup placed immediately under the header */}
      {showPopup && user && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: 12,
          zIndex: 1000
        }}>
          <div style={{
            width: 'min(640px, 92%)',
            background: 'white',
            border: '1px solid #ccc',
            padding: 16,
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Bienvenue</div>
            <div style={{ fontSize: 18 }}>{user.prenom} {user.nom} ({user.role})!</div>
          </div>
        </div>
      )}

      <main style={{ padding: 20 }}>
        
        <TrashMapChef/>
      </main>
    </div>
  );
}
