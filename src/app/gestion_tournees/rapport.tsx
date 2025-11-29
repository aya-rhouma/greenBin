"use client";

import React, { useState, useEffect } from 'react';

// employees will be loaded from `public/data/tournee.xml` and resolved against `public/data/users.xml`
const TYPES_DECHETS = ["Plastique", "Papier", "Verre", "Autre"];

export default function RapportPage() {
  const [idTournee, setIdTournee] = useState<number | ''>('');
  const [vehicule, setVehicule] = useState('');
  const [date, setDate] = useState('');
  const [employees, setEmployees] = useState<Array<{id:number, login:string, nom:string, prenom:string, display:string}>>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [otherTypeText, setOtherTypeText] = useState('');
  const [selectedTrashcansData, setSelectedTrashcansData] = useState<Array<{id:number, quantite:number}>>([]);
  const [loading, setLoading] = useState(false);

  const toggleEmployee = (id: number) => {
    setSelectedEmployees(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleType = (name: string) => {
    setSelectedTypes(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]));
  };

  // load tournees/users/vehicules and resolve employees for a selected tournee
  useEffect(() => {
    async function loadEmployeesForTournee(selectedId?: number | '') {
      try {
        const tourRes = await fetch('/data/tournee.xml');
        const tourText = await tourRes.text();
        const parser = new DOMParser();
        const tourDoc = parser.parseFromString(tourText, 'application/xml');
        const tournees = Array.from(tourDoc.querySelectorAll('tournee'));

        // fetch users map
        const usersRes = await fetch('/data/users.xml');
        const usersText = await usersRes.text();
        const usersDoc = parser.parseFromString(usersText, 'application/xml');
        const userEls = Array.from(usersDoc.querySelectorAll('user'));
        const userMap: Record<number, {login:string, nom:string, prenom:string}> = {};
        for (const u of userEls) {
          const idAttr = u.getAttribute('id');
          if (!idAttr) continue;
          const id = Number(idAttr);
          const loginEl = u.querySelector('login');
          const nomEl = u.querySelector('nom');
          const prenomEl = u.querySelector('prenom');
          userMap[id] = { login: loginEl?.textContent?.trim() || '', nom: nomEl?.textContent?.trim() || '', prenom: prenomEl?.textContent?.trim() || '' };
        }

        // try to auto-detect tournee by connected chef -> vehicle
        let detectedTourneeId: number | '' = '';
        let detectedMatricule: string | null = null;
        try {
          const rawChef = typeof window !== 'undefined' ? sessionStorage.getItem('user') : null;
          if (rawChef) {
            const chefObj = JSON.parse(rawChef);
            const chefId = Number(chefObj?.id);
            if (!isNaN(chefId)) {
              const vehRes = await fetch('/data/vehicule.xml');
              const vehText = await vehRes.text();
              const vehDoc = parser.parseFromString(vehText, 'application/xml');
              const vehEls = Array.from(vehDoc.querySelectorAll('vehicule'));
              let foundVehId: number | null = null;
              for (const v of vehEls) {
                const ch = v.querySelector('chauffeur');
                const vid = v.getAttribute('id');
                if (ch && vid) {
                  const chId = Number(ch.getAttribute('id'));
                  if (!isNaN(chId) && chId === chefId) {
                    foundVehId = Number(vid);
                    const mat = v.querySelector('matricule')?.textContent?.trim() || null;
                    detectedMatricule = mat;
                    break;
                  }
                }
              }
              if (foundVehId !== null) {
                for (const t of tournees) {
                  const vEl = t.querySelector('vehicule');
                  if (vEl && Number(vEl.getAttribute('id')) === foundVehId) {
                    detectedTourneeId = Number(t.getAttribute('id')) || '';
                    break;
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('vehicule/tournee resolve error', err);
        }

        // choose the tournee id to use: prefer explicit selectedId, then detected, then first tournee
        let useId: number | '' = '';
        if (selectedId !== undefined && selectedId !== '') useId = selectedId;
        else if (detectedTourneeId !== '') useId = detectedTourneeId;
        else if (tournees.length) useId = Number(tournees[0].getAttribute('id')) || '';

        // set state if we detected or chose a tournee
        if (useId !== '' && useId !== idTournee) {
          setIdTournee(useId);
        }
        if (detectedMatricule) setVehicule(detectedMatricule);

        // find the chosen tournee element and extract ouvrier ids
        const chosen = tournees.find(t => Number(t.getAttribute('id')) === Number(useId));
        const ouvrierEls = chosen ? Array.from(chosen.querySelectorAll('ouvrier')) : [];
        const ids = ouvrierEls.map(el => Number(el.getAttribute('id'))).filter(n => !isNaN(n));

        const list = ids.map(id => {
          const u = userMap[id];
          return { id, login: u?.login || `${id}`, nom: u?.nom || '', prenom: u?.prenom || '', display: (u?.prenom && u?.nom) ? `${u.prenom} ${u.nom}` : (u?.login || `${id}`) };
        });
        setEmployees(list);

        // also try to fetch the vehicle matricule referenced by this tournee's <vehicule id="..."/>
        try {
          if (chosen) {
            const vEl = chosen.querySelector('vehicule');
            const vidAttr = vEl?.getAttribute('id');
            if (vidAttr) {
              const vid = Number(vidAttr);
              if (!isNaN(vid)) {
                const vehRes2 = await fetch('/data/vehicule.xml');
                const vehText2 = await vehRes2.text();
                const vehDoc2 = parser.parseFromString(vehText2, 'application/xml');
                const found = Array.from(vehDoc2.querySelectorAll('vehicule')).find(v => Number(v.getAttribute('id')) === vid);
                const mat = found?.querySelector('matricule')?.textContent?.trim() || null;
                if (mat) setVehicule(mat);
              }
            }
          }
        } catch (err) {
          console.error('error loading vehicule matricule for chosen tournee', err);
        }
      } catch (err) {
        console.error('load employees error', err);
      }
    }

    // initial load: if idTournee has been set externally we'll use it, otherwise let the loader detect
    loadEmployeesForTournee(idTournee === '' ? undefined : idTournee);
  }, []);

  // reload employees whenever the tournee id is changed manually
  useEffect(() => {
    if (idTournee === '') return;
    // reload employees for the newly selected tournee
    (async () => {
      try {
        const parser = new DOMParser();
        const tourRes = await fetch('/data/tournee.xml');
        const tourText = await tourRes.text();
        const tourDoc = parser.parseFromString(tourText, 'application/xml');
        const tournees = Array.from(tourDoc.querySelectorAll('tournee'));
        const chosen = tournees.find(t => Number(t.getAttribute('id')) === Number(idTournee));
        const ouvrierEls = chosen ? Array.from(chosen.querySelectorAll('ouvrier')) : [];
        const ids = ouvrierEls.map(el => Number(el.getAttribute('id'))).filter(n => !isNaN(n));
        const usersRes = await fetch('/data/users.xml');
        const usersText = await usersRes.text();
        const usersDoc = parser.parseFromString(usersText, 'application/xml');
        const userEls = Array.from(usersDoc.querySelectorAll('user'));
        const userMap: Record<number, {login:string, nom:string, prenom:string}> = {};
        for (const u of userEls) {
          const idAttr = u.getAttribute('id');
          if (!idAttr) continue;
          const id = Number(idAttr);
          const loginEl = u.querySelector('login');
          const nomEl = u.querySelector('nom');
          const prenomEl = u.querySelector('prenom');
          userMap[id] = { login: loginEl?.textContent?.trim() || '', nom: nomEl?.textContent?.trim() || '', prenom: prenomEl?.textContent?.trim() || '' };
        }
        const list = ids.map(id => {
          const u = userMap[id];
          return { id, login: u?.login || `${id}`, nom: u?.nom || '', prenom: u?.prenom || '', display: (u?.prenom && u?.nom) ? `${u.prenom} ${u.nom}` : (u?.login || `${id}`) };
        });
        setEmployees(list);

        // fetch vehicle matricule for this tournee and set it
        try {
          const chosenVehId = chosen?.querySelector('vehicule')?.getAttribute('id');
          if (chosenVehId) {
            const vid = Number(chosenVehId);
            if (!isNaN(vid)) {
              const vehRes = await fetch('/data/vehicule.xml');
              const vehText = await vehRes.text();
              const vehDoc = parser.parseFromString(vehText, 'application/xml');
              const vehFound = Array.from(vehDoc.querySelectorAll('vehicule')).find(v => Number(v.getAttribute('id')) === vid);
              const mat = vehFound?.querySelector('matricule')?.textContent?.trim() || null;
              if (mat) setVehicule(mat);
            }
          }
        } catch (err) {
          console.error('reload: error loading vehicule matricule', err);
        }
      } catch (err) {
        console.error('reload employees error', err);
      }
    })();
  }, [idTournee]);

  // load selected trashcans (ids) from sessionStorage and initialize quantities
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('selectedTrashcans') : null;
      if (raw) {
        const ids = JSON.parse(raw) as number[];
        if (Array.isArray(ids)) {
          const arr = ids.map(id => ({ id: Number(id), quantite: 0 }));
          setSelectedTrashcansData(arr);
        }
      }
    } catch (err) {
      // ignore
    }
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    // build payload: include connected chef, present and absent workers, and selected trashcans from map
    let chef = null;
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('user') : null;
      if (raw) chef = JSON.parse(raw);
    } catch {}

    // build present/absent arrays as user logins (server helper looks up by login/nom/prenom)
    const presentEmployees = selectedEmployees.map(id => {
      const u = employees.find(e => e.id === id);
      return u?.login || `${id}`;
    });
    const absentEmployees = employees.filter(e => !selectedEmployees.includes(e.id)).map(e => e.login || `${e.id}`);

    // send current trashcans with quantities
    const selectedTrashcans = selectedTrashcansData.map(t => ({ id: t.id, quantite: Number(t.quantite) }));

    const payload = { idTournee, vehicule, date, chef, presentEmployees, absentEmployees, selectedTrashcans };

    try {
      const res = await fetch('/api/rapport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        // try to read JSON error, fallback to text
        let txt = '';
        try { const j = await res.json(); txt = j?.error || JSON.stringify(j); } catch { txt = await res.text().catch(()=>res.statusText); }
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const json = await res.json();
      alert(json?.message || 'Rapport envoyé');
    } catch (err: any) {
      console.error('rapport submit error', err);
      alert('Erreur lors de l envoi du rapport: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:36,height:36,borderRadius:18,background:'#10b981',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>G</div>
          <div style={{fontWeight:600}}>GreenBin</div>
        </div>
        <div style={{fontWeight:600}}>Rapport de tournée</div>
        <div><img src="/profile_pic.png" alt="profile" style={{width:36,height:36,borderRadius:18}}/></div>
      </header>

      <main className="container" style={{marginTop:16}}>
        <div style={{display:'flex',flexDirection:'row',gap:20,alignItems:'flex-start'}}>

          <section style={{flex:2}}>
            <form className="card" onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:12}}>
              <h1 style={{fontSize:22,margin:0}}>Ajouter un Rapport</h1>

              <div>
                <label style={{display:'block',fontSize:13,marginBottom:6}}>ID Tournée</label>
                <input className="input" type="number" value={idTournee as number} onChange={e=>setIdTournee(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>

              <div>
                <label style={{display:'block',fontSize:13,marginBottom:6}}>Véhicule</label>
                <input className="input" type="text" value={vehicule} onChange={e=>setVehicule(e.target.value)} placeholder="ex : 145-TN-2033" />
              </div>

              <div>
                <label style={{display:'block',fontSize:13,marginBottom:6}}>Date</label>
                <input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} />
              </div>

              <div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>Employés</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {employees.map(e => {
                    const active = selectedEmployees.includes(e.id);
                    return (
                      <button key={e.id} type="button" className={`chip ${active? 'active':''}`} onClick={()=>toggleEmployee(e.id)}>
                        {e.display}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>Types de déchets</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  {TYPES_DECHETS.map(t => {
                    const active = selectedTypes.includes(t);
                    return (
                      <button key={t} type="button" className={`chip ${active? 'active':''}`} onClick={()=>toggleType(t)}>
                        {t}
                      </button>
                    );
                  })}

                  {selectedTypes.includes('Autre') && (
                    <input className="input" type="text" placeholder="Précisez autre type" value={otherTypeText} onChange={e=>setOtherTypeText(e.target.value)} style={{width:'auto'}} />
                  )}
                </div>
              </div>

              <div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>Bennes sélectionnées</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {selectedTrashcansData.length ? selectedTrashcansData.map(t => (
                    <div key={t.id} style={{display:'flex',gap:8,alignItems:'center'}}>
                      <div className="chip">ID {t.id}</div>
                      <label style={{fontSize:13}}>Quantité</label>
                      <input className="input" type="number" value={t.quantite} min={0} onChange={e=>{
                        const q = Number(e.target.value) || 0;
                        setSelectedTrashcansData(prev => prev.map(p => p.id === t.id ? { ...p, quantite: q } : p));
                      }} style={{width:100}} />
                    </div>
                  )) : <div style={{color:'#9ca3af'}}>Aucune benne sélectionnée depuis la carte</div>}
                </div>
              </div>

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                <div className="summary">Résumé : {selectedEmployees.length} employés • {selectedTypes.length} types</div>
                <button type="submit" className="btn" disabled={loading}>{loading ? 'Envoi...' : 'Ajouter au rapport'}</button>
              </div>
            </form>
          </section>

          <aside style={{flex:1}} className="card">
            <h3 style={{marginTop:0}}>Aperçu du rapport</h3>
            <div style={{marginTop:8}}>ID Tournée: <strong>{idTournee || '-'}</strong></div>
            <div style={{marginTop:8}}>Véhicule: <strong>{vehicule || '-'}</strong></div>
            <div style={{marginTop:8}}>Date: <strong>{date || '-'}</strong></div>

              <div style={{marginTop:12}}>
              <div style={{fontWeight:600,marginBottom:6}}>Employés sélectionnés</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {selectedEmployees.length ? selectedEmployees.map(id => {
                  const u = employees.find(e => e.id === id);
                    return <span key={id} className="chip" style={{background:'#ecfdf5',borderColor:'#10b981'}}>{u?.display || id}</span>
                }) : <div style={{color:'#9ca3af'}}>Aucun</div>}
              </div>
            </div>

              <div style={{marginTop:12}}>
                <div style={{fontWeight:600,marginBottom:6}}>Bennes sélectionnées</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {selectedTrashcansData.length ? selectedTrashcansData.map(t => (
                    <span key={t.id} className="chip" style={{background:'#ecfdf5',borderColor:'#10b981'}}>{`ID ${t.id} — q=${t.quantite}`}</span>
                  )) : <div style={{color:'#9ca3af'}}>Aucune</div>}
                </div>
              </div>

            <div style={{marginTop:12}}>
              <div style={{fontWeight:600,marginBottom:6}}>Types de déchets</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {selectedTypes.length ? selectedTypes.map(t => (
                  <span key={t} className="chip" style={{background:'#fffbeb',borderColor:'#f59e0b'}}>{t}</span>
                )) : <div style={{color:'#9ca3af'}}>Aucun</div>}
              </div>
            </div>
          </aside>

        </div>
      </main>
    </div>
  );
}
