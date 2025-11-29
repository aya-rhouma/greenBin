'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngTuple, Map } from 'leaflet';
import { useRouter } from 'next/navigation';

import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';

type TrashStatus = 'pleine' | 'moitie' | 'vide';

interface TrashCan {
  id: number;
  name: string;
  lat: number;
  lng: number;
  status: TrashStatus;
}

export default function TrashMapChef() {
  const [trashCans, setTrashCans] = useState<TrashCan[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [leaflet, setLeaflet] = useState<any>(null);
  const [routeControl, setRouteControl] = useState<any>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const mapRef = useRef<Map | null>(null);
  const router = useRouter();

  const start: LatLngTuple = [34.740461, 10.760018]; // point de départ

  // Charger les données XML via l’API
  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/trashcans');
      const data = await res.json();
      setTrashCans(
        (data || []).map((c: any) => {
          const raw = String(c.status || '').toLowerCase();
          let status: TrashStatus = 'pleine';
          if (raw.includes('vide') || raw === 'empty') status = 'vide';
          else if (raw.includes('mo') || raw.includes('half') || raw.includes('moitié') || raw.includes('moitie')) status = 'moitie';

          return {
            id: Number(c.id) || 0,
            name: c.name || c.adresse || '',
            lat: Number(c.lat) || 0,
            lng: Number(c.lng) || 0,
            status,
          } as TrashCan;
        })
      );
    };
    load();
  }, []);

  // Charger Leaflet côté client
  useEffect(() => {
    if (typeof window === 'undefined') return;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet-routing-machine');

      if (!L.Routing) {
        L.Routing = (window as any).L.Routing;
      }

      setLeaflet(L);
    })();
  }, []);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // persist selected trashcans across navigation so the rapport page can read them
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('selectedTrashcans', JSON.stringify(selectedIds));
      }
    } catch {}
  }, [selectedIds]);

  const handleEmpty = async (id: number) => {
    // Optimistic update: mark as 'vide' locally; remember previous status to revert on error
    let prevStatus: TrashStatus | null = null;
    setTrashCans((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          prevStatus = c.status;
          return { ...c, status: 'vide' };
        }
        return c;
      })
    );
    setActiveId(id);

    try {
      const res = await fetch('/api/trashcans/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Status ${res.status}`);
      }
      // success: server updated file
    } catch (err) {
      console.error('Failed to persist trashcan empty action', err);
      // revert optimistic update on failure
      if (prevStatus !== null) {
        setTrashCans((prev) => prev.map((c) => (c.id === id ? { ...c, status: prevStatus! } : c)));
      }
      // optionally notify user
    }
  };

  const getIcon = (status: TrashStatus, selected = false) => {
    if (!leaflet) return null;
    const iconUrl = {
      pleine: '/icons/trash-red.png',
      moitie: '/icons/trash-orange.png',
      vide: '/icons/trash-green.png',
    }[status];

    if (!iconUrl) return null;

    return leaflet.icon({
      iconUrl,
      iconSize: selected ? [45, 45] : [35, 35],
      iconAnchor: selected ? [22, 45] : [17, 34],
      popupAnchor: [0, -30],
    });
  };

  const getCurrentLocationIcon = (leaflet: any) =>
    leaflet.icon({
      iconUrl: '/icons/location-red.png',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -30],
    });

  // Mettre à jour la route
  useEffect(() => {
    if (!leaflet || !mapRef.current) return;

    if (routeControl) {
      try {
        mapRef.current.removeControl(routeControl);
      } catch {}
    }

    if (selectedIds.length === 0) return;

    const waypoints = [leaflet.latLng(start[0], start[1])];
    selectedIds.forEach((id) => {
      const can = trashCans.find((c) => c.id === id);
      if (can) waypoints.push(leaflet.latLng(can.lat, can.lng));
    });

    const routing = leaflet.Routing.control({
      waypoints,
      router: leaflet.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
      }),
      lineOptions: { styles: [{ color: '#007bff', weight: 7, opacity: 0.9 }] },
      createMarker: () => null,
      routeWhileDragging: false,
      show: true,
    }).addTo(mapRef.current);

    // Style du panneau de route
    const container = routing.getContainer?.();
    if (container) {
      container.style.top = '20px';
      container.style.right = '20px';
      container.style.left = 'auto';
      container.style.backgroundColor = 'rgba(255, 255, 255, 0.97)';
      container.style.padding = '16px';
      container.style.borderRadius = '10px';
      container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      container.style.fontSize = '16px';
      container.style.fontWeight = 'bold';
      container.style.lineHeight = '1.6';
      container.style.maxWidth = '280px';
      container.style.color = '#111';
      container.style.border = '3px solid #007bff';
      container.style.textAlign = 'left';
    }

    setRouteControl(routing);

    return () => {
      if (mapRef.current && routing) mapRef.current.removeControl(routing);
    };
  }, [selectedIds, leaflet, trashCans]);

  if (!leaflet) return <div>Loading map...</div>;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 1000 }}>
        <button
          onClick={() => router.push('/rapport')}
          className="bg-blue-600 text-white px-5 py-2 rounded shadow hover:bg-blue-700 transition"
        >
          Créer rapport de la journée
        </button>
      </div>

      <MapContainer
        center={start}
        zoom={13}
        style={{ height: '80vh', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution="&copy; GreenBin"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={start} icon={getCurrentLocationIcon(leaflet)}>
          <Popup>
            <b>Current Location</b>
            <p>Start of route</p>
          </Popup>
        </Marker>

        {trashCans.map((can) => {
          const icon = getIcon(can.status, selectedIds.includes(can.id));
          if (!icon) return null;
          return (
            <Marker
              key={can.id}
              position={[can.lat, can.lng]}
              icon={icon}
              eventHandlers={{
                click: (e: any) => {
                  // If the marker is not already selected, add it to selectedIds.
                  // If it is already selected, keep it selected and just open/show the popup.
                  if (!selectedIds.includes(can.id)) {
                    setSelectedIds((prev) => (prev.includes(can.id) ? prev : [...prev, can.id]));
                  }
                  setActiveId(can.id);
                  try {
                    e?.target && e.target.openPopup && e.target.openPopup();
                  } catch {}
                },
              }}
            >
              <Popup>
                <h3>{can.name}</h3>
                <p>Status: {can.status.toUpperCase()}</p>
                <p>Coordinates: {can.lat.toFixed(3)}, {can.lng.toFixed(3)}</p>
                <p>{selectedIds.includes(can.id) ? '✅ Selected' : 'Click to select'}</p>
                {selectedIds.includes(can.id) && activeId === can.id && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => handleEmpty(can.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                    >
                      Vider
                    </button>
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
