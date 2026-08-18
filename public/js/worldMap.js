// public/js/worldMap.js
(function () {
    const overlay  = document.getElementById('worldMapOverlay');
    const openBtn  = document.getElementById('openWorldMapBtn');
    const closeBtn = document.getElementById('closeWorldMapBtn');
    const loading  = document.getElementById('worldMapLoading');

    let map            = null;
    let loaded         = false;
    let activityLayers = []; // pins secundários ativos

    const typeColors = {
        visita:     '#60a5fa',
        refeicao:   '#4ade80',
        lazer:      '#fca311',
        alojamento: '#fb7185',
    };
    const typeIcons = {
        visita:     '🏛️',
        refeicao:   '🍽️',
        lazer:      '🎉',
        alojamento: '🏨',
    };

    let destinations = null;

    openBtn?.addEventListener('click', async e => {
        e.preventDefault();
        if (map) {
            overlay.style.display = 'flex';
            setTimeout(() => map.invalidateSize(), 50);
            return;
        }
        // Abrir modal com loading visível
        overlay.style.display = 'flex';
        loading.style.display = 'flex';
        try {
            const res  = await fetch('/dashboard/world-map-data');
            const data = await res.json();
            destinations = data.destinations || [];
        } catch (err) {
            console.error('WorldMap fetch error:', err);
            loading.innerHTML = '<p style="color:#fb7185;text-align:center;">Erro ao carregar dados.</p>';
            return;
        }
        loading.style.display = 'none';
        requestAnimationFrame(() => initMap());
    });

    closeBtn?.addEventListener('click', () => {
        overlay.style.display = 'none';
    });

    overlay?.addEventListener('click', e => {
        if (e.target === overlay) overlay.style.display = 'none';
    });

    function initMap() {
        map = L.map('worldMapEl', { center: [20, 0], zoom: 2, zoomControl: true });
        setTimeout(() => map.invalidateSize(), 100);

        // Botão de reset de vista
        const ResetControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function() {
                const btn = L.DomUtil.create('button', '');
                btn.innerHTML = '<i class="fa-solid fa-earth-europe"></i>';
                btn.title = 'Vista global';
                btn.style.cssText = 'width:34px;height:34px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:4px;cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center;margin-top:4px;';
                btn.onmouseover = () => btn.style.background = '#f4f4f4';
                btn.onmouseout  = () => btn.style.background = '#fff';
                L.DomEvent.on(btn, 'click', L.DomEvent.stopPropagation);
                L.DomEvent.on(btn, 'click', L.DomEvent.preventDefault);
                L.DomEvent.on(btn, 'click', () => {
                    clearActivityLayers();
                    map.flyTo([20, 0], 2, { duration: 1 });
                });
                return btn;
            }
        });
        map.addControl(new ResetControl());

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap © CARTO',
            subdomains: 'abcd',
            maxZoom: 19,
        }).addTo(map);

        if (!destinations || destinations.length === 0) {
            showEmpty();
            return;
        }

        const bounds = [];

        destinations.forEach(dest => {
            const latlng = [dest.lat, dest.lon];
            bounds.push(latlng);

            const pin = L.divIcon({
                html: `<div style="position:relative;width:32px;height:42px;cursor:pointer;">
                    <svg viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;filter:drop-shadow(0 3px 5px rgba(0,0,0,.4));">
                        <path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 16 26 16 26S32 26.5 32 16C32 7.163 24.837 0 16 0z" fill="#fca311"/>
                        <circle cx="16" cy="16" r="7" fill="#fff"/>
                    </svg>
                </div>`,
                iconSize: [32, 42],
                iconAnchor: [16, 42],
                popupAnchor: [0, -44],
                className: '',
            });

            const marker = L.marker(latlng, { icon: pin }).addTo(map);
            marker.bindTooltip(`<b>${dest.city || dest.destination}</b>${dest.country ? `<br><small>${dest.country}</small>` : ''}`, { direction: 'top', offset: [0, -44] });

            marker.on('click', () => {
                clearActivityLayers();
                map.flyTo(latlng, 13, { duration: 1.2 });
                map.once('moveend', () => showActivities(dest));
            });
        });

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
        }

        map.on('zoomend', () => {
            if (map.getZoom() < 9) clearActivityLayers();
        });
    }

    function clearActivityLayers() {
        activityLayers.forEach(l => map.removeLayer(l));
        activityLayers = [];
    }

    function showActivities(dest) {
        const activities = dest.activities;
        if (!activities || activities.length === 0) return;

        for (const act of activities) {
            if (!act.lat || !act.lon) continue;

            const color = typeColors[act.type] || '#888';
            const emoji = typeIcons[act.type] || '📍';

            const icon = L.divIcon({
                html: `<div style="
                    background:${color};
                    color:#fff;
                    width:32px;height:32px;
                    border-radius:50%;
                    display:flex;align-items:center;justify-content:center;
                    font-size:.9rem;
                    border:2px solid #fff;
                    box-shadow:0 2px 6px rgba(0,0,0,.35);
                    cursor:pointer;
                ">${emoji}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                className: '',
            });

            const marker = L.marker([act.lat, act.lon], { icon }).addTo(map);
            marker.bindPopup(`
                <div style="font-family:Inter,sans-serif;min-width:160px;">
                    <div style="font-weight:700;font-size:.88rem;margin-bottom:4px;">${act.name}</div>
                    ${act.time ? `<div style="font-size:.73rem;color:#888;margin-bottom:4px;">⏰ ${act.time}</div>` : ''}
                    ${act.description ? `<div style="font-size:.78rem;color:#444;line-height:1.4;">${act.description}</div>` : ''}
                </div>
            `, { maxWidth: 220 });

            activityLayers.push(marker);
        }
    }

    function showEmpty() {
        loading.style.display = 'flex';
        loading.innerHTML = `
            <div style="text-align:center;color:#888;padding:40px;">
                <div style="font-size:3rem;margin-bottom:12px;">🗺️</div>
                <p style="margin:0;font-size:.9rem;">Ainda não tens destinos visitados.</p>
                <p style="margin:4px 0 0;font-size:.8rem;">Partilha roteiros no feed para veres o teu mapa!</p>
            </div>
        `;
    }
})();
