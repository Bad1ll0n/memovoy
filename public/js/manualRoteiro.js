/* ============================================================
   manualRoteiro.js — Construtor de roteiro manual
   Compatível com Helmet CSP (sem inline scripts/handlers)
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

    /* ══════════════════════════════════
       ESTADO
    ══════════════════════════════════ */
    const raw         = document.getElementById('builder-data').textContent;
    const config      = JSON.parse(raw);
    const DESTINATION = config.destination;
    const DEP_DATE    = config.departureDate;
    const RET_DATE    = config.returnDate;

    // Estado dos dias (array mutável)
    let days = config.days;
    let currentDayIdx = 0;

    /* ══════════════════════════════════
       TABS + PAINÉIS DE DIAS
    ══════════════════════════════════ */
    const tabsWrap   = document.getElementById('dayTabs');
    const panelsWrap = document.getElementById('dayPanelsWrap');

    function buildDayUI() {
        tabsWrap.innerHTML   = '';
        panelsWrap.innerHTML = '';

        days.forEach((day, i) => {
            // Tab
            const tab = document.createElement('button');
            tab.className   = `day-tab${i === currentDayIdx ? ' active' : ''}`;
            tab.dataset.day = i;
            tab.textContent = `Dia ${day.dayNumber}`;
            tab.addEventListener('click', () => switchDay(i));
            tabsWrap.appendChild(tab);

            // Painel
            const panel = document.createElement('div');
            panel.className = `day-panel${i === currentDayIdx ? ' active' : ''}`;
            panel.id        = `day-panel-${i}`;
            panel.innerHTML = renderDayPanel(day, i);
            panelsWrap.appendChild(panel);
        });

        // Liga botões de remover atividade
        bindRemoveButtons();
    }

    function renderDayPanel(day, dayIdx) {
        const formatted = new Date(day.date + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
        const total     = calcDayTotal(day.activities);

        let activitiesHTML = '';

        if (day.activities.length === 0) {
            activitiesHTML = `
              <div class="empty-day">
                <i class="fa-regular fa-calendar-plus"></i>
                <p>${(window._mr && window._mr.noActivities) || 'No activities yet.'}</p>
              </div>`;
        } else {
            // Ordena por hora de início
            const sorted = [...day.activities].sort((a, b) => a.time.localeCompare(b.time));
            activitiesHTML = `<div class="activity-list">` + sorted.map((act, actIdx) => `
              <div class="activity-item">
                <div class="act-time-col">${act.time}</div>
                <div class="act-dot"></div>
                <div class="act-card">
                  <div class="act-card-top">
                    <span class="act-name">${act.name}</span>
                    <span class="act-type-badge type-${act.type}">${act.type}</span>
                  </div>
                  ${act.description ? `<div class="act-desc">${act.description}</div>` : ''}
                  <div class="act-meta-row">
                    ${act.timeEnd ? `<span><i class="fa-regular fa-clock"></i> ${act.time} – ${act.timeEnd}</span>` : `<span><i class="fa-regular fa-clock"></i> ${act.time}</span>`}
                    ${act.estimatedCost ? `<span><i class="fa-solid fa-euro-sign"></i> ${act.estimatedCost}</span>` : ''}
                  </div>
                  ${act.tip ? `<div class="act-tip-row"><i class="fa-solid fa-lightbulb"></i>${act.tip}</div>` : ''}
                  <button class="btn-remove-act" data-day="${dayIdx}" data-act="${actIdx}">
                    <i class="fa-solid fa-trash-can"></i> Remover
                  </button>
                </div>
              </div>`).join('') + `</div>`;
        }

        return `
          <div class="day-header-bar">
            <div>
              <div class="day-date">${formatted}</div>
              <input class="day-title-input" type="text"
                placeholder="${(window._mr && window._mr.titlePlaceholder) || 'Day title (optional)'}"
                value="${day.title !== `Dia ${day.dayNumber}` ? day.title : ''}"
                data-day="${dayIdx}">
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="day-total"><i class="fa-solid fa-coins me-1"></i>${total}</div>
              ${day.activities.length > 0 ? `<button class="btn-map-day" data-day="${dayIdx}"><i class="fa-solid fa-map-location-dot"></i> Mapa</button>` : ''}
            </div>
          </div>
          ${activitiesHTML}`;
    }

    function calcDayTotal(activities) {
        const costs = activities
            .map(a => parseFloat((a.estimatedCost || '').replace(/[^0-9.]/g, '')))
            .filter(n => !isNaN(n) && n > 0);
        if (costs.length === 0) return '—';
        return '€' + costs.reduce((s, c) => s + c, 0).toFixed(0);
    }

    function switchDay(idx) {
        currentDayIdx = idx;
        document.querySelectorAll('.day-tab').forEach((t, i)   => t.classList.toggle('active', i === idx));
        document.querySelectorAll('.day-panel').forEach((p, i) => p.classList.toggle('active', i === idx));
        // Limpa sugestões ao trocar de dia
        document.getElementById('suggestionsSection').style.display = 'none';
        document.getElementById('suggestionsSection').innerHTML = '';
    }

    function bindMapButtons() {
        document.querySelectorAll('.btn-map-day').forEach(btn => {
            btn.addEventListener('click', function () {
                openDayMap(parseInt(this.dataset.day));
            });
        });
    }

    function bindRemoveButtons() {
        document.querySelectorAll('.btn-remove-act').forEach(btn => {
            btn.addEventListener('click', function () {
                const dayIdx = parseInt(this.dataset.day);
                const actIdx = parseInt(this.dataset.act);
                // Remove pelo índice original (antes de ordenar)
                const sorted = [...days[dayIdx].activities].sort((a, b) => a.time.localeCompare(b.time));
                const actToRemove = sorted[actIdx];
                days[dayIdx].activities = days[dayIdx].activities.filter(a => a !== actToRemove);
                refreshDay(dayIdx);
            });
        });

        bindMapButtons();

        // Liga inputs de título
        document.querySelectorAll('.day-title-input').forEach(input => {
            input.addEventListener('input', function () {
                days[parseInt(this.dataset.day)].title = this.value || `Dia ${parseInt(this.dataset.day) + 1}`;
            });
        });
    }

    function refreshDay(dayIdx) {
        const panel = document.getElementById(`day-panel-${dayIdx}`);
        if (panel) {
            panel.innerHTML = renderDayPanel(days[dayIdx], dayIdx);
            bindRemoveButtons();
        }
    }

    // Inicializa
    buildDayUI();


    /* ══════════════════════════════════
       ADICIONAR ATIVIDADE
    ══════════════════════════════════ */
    const addBtn = document.getElementById('addActivityBtn');

    addBtn.addEventListener('click', function () {
        const name      = document.getElementById('actName').value.trim();
        const type      = document.getElementById('actType').value;
        const timeStart = document.getElementById('actTimeStart').value;
        const timeEnd   = document.getElementById('actTimeEnd').value;
        const cost      = document.getElementById('actCost').value.trim();
        const desc      = document.getElementById('actDesc').value.trim();
        const tip       = document.getElementById('actTip').value.trim();

        if (!name) { showToast((window._mr && window._mr.indicateName) || 'Enter activity name.', 'error'); return; }
        if (!timeStart) { showToast((window._mr && window._mr.indicateStart) || 'Enter start time.', 'error'); return; }

        const activity = {
            name, type, time: timeStart, timeEnd: timeEnd || '',
            estimatedCost: cost, description: desc, tip,
        };

        days[currentDayIdx].activities.push(activity);
        refreshDay(currentDayIdx);
        clearForm();
        showToast((window._mr && window._mr.activityAdded) || 'Activity added!', 'success');
    });

    function clearForm() {
        document.getElementById('actName').value     = '';
        document.getElementById('actCost').value     = '';
        document.getElementById('actDesc').value     = '';
        document.getElementById('actTip').value      = '';
        document.getElementById('actTimeStart').value= '09:00';
        document.getElementById('actTimeEnd').value  = '11:00';
    }


    /* ══════════════════════════════════
       PESQUISA LIVRE
    ══════════════════════════════════ */
    const searchInput = document.getElementById('searchActivityInput');
    const searchBtn   = document.getElementById('searchActivityBtn');

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    async function doSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        const section = document.getElementById('suggestionsSection');
        section.style.display = 'block';
        section.innerHTML     = '<div class="panel-spinner"></div>';

        try {
            const res  = await fetch('/manualRoteiro/search', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, destination: DESTINATION }),
            });
            const data = await res.json();

            if (!data.success || !data.activity.found) {
                section.innerHTML = `<p style="color:var(--muted);font-size:.8rem;text-align:center;padding:12px">Nenhum resultado para "${query}"</p>`;
                return;
            }

            renderSuggestionCards([data.activity], section);

        } catch (err) {
            section.innerHTML = '<p style="color:var(--danger);font-size:.8rem;text-align:center;padding:12px">Erro na pesquisa. Tenta novamente.</p>';
        }
    }


    /* ══════════════════════════════════
       SUGESTÕES IA
    ══════════════════════════════════ */
    const suggestBtn = document.getElementById('suggestIaBtn');

    suggestBtn.addEventListener('click', async function () {
        const section = document.getElementById('suggestionsSection');
        section.style.display = 'block';
        section.innerHTML     = '<div class="panel-spinner"></div>';
        suggestBtn.disabled   = true;

        const day = days[currentDayIdx];

        try {
            const res  = await fetch('/manualRoteiro/suggest', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destination: DESTINATION,
                    date:        day.date,
                    dayNumber:   day.dayNumber,
                    existingActivities: day.activities,
                }),
            });
            const data = await res.json();

            if (!data.success) throw new Error(data.error);

            renderSuggestionCards(data.suggestions, section);

        } catch (err) {
            section.innerHTML = '<p style="color:var(--danger);font-size:.8rem;text-align:center;padding:12px">' + ((window._mr && window._mr.errorSuggest) || 'Error generating suggestions. Try again.') + '</p>';
        } finally {
            suggestBtn.disabled = false;
        }
    });

    function renderSuggestionCards(suggestions, container) {
        container.innerHTML = '';
        // Calcula a próxima hora disponível uma vez para todos os cards
        const nextAvailable = getNextAvailableTime(currentDayIdx);
        suggestions.forEach(sugg => {
            const card = document.createElement('div');
            card.className = 'sugg-card';
            const endTime = sugg.suggestedDuration ? calcEndTime(nextAvailable, sugg.suggestedDuration) : '';
            card.innerHTML = `
              <div class="sugg-card-name">${sugg.name}</div>
              <div class="sugg-card-desc">${sugg.description || ''}</div>
              <div class="sugg-card-meta">
                <span><i class="fa-regular fa-clock"></i> ${nextAvailable}${endTime ? ' – ' + endTime : ''}</span>
                ${sugg.estimatedCost ? `<span><i class="fa-solid fa-euro-sign"></i> ${sugg.estimatedCost}</span>` : ''}
                ${sugg.suggestedDuration ? `<span><i class="fa-solid fa-hourglass-half"></i> ${sugg.suggestedDuration}</span>` : ''}
              </div>`;

            card.addEventListener('click', function () {
                container.querySelectorAll('.sugg-card').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
                // Preenche o formulário
                document.getElementById('actName').value      = sugg.name || '';
                document.getElementById('actType').value      = sugg.type || 'visita';
                // Usa a próxima hora disponível em vez do horário sugerido pela IA
                const nextTime = getNextAvailableTime(currentDayIdx);
                document.getElementById('actTimeStart').value = nextTime;
                document.getElementById('actCost').value      = sugg.estimatedCost || '';
                document.getElementById('actDesc').value      = sugg.description || '';
                document.getElementById('actTip').value       = sugg.tip || '';
                // Calcula hora fim com base na próxima hora disponível + duração
                if (sugg.suggestedDuration) {
                    document.getElementById('actTimeEnd').value = calcEndTime(nextTime, sugg.suggestedDuration);
                }
                document.getElementById('actName').scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            container.appendChild(card);
        });
    }

    function durStrToMin(dur) {
        if (!dur) return 60;
        const s = String(dur).toLowerCase().trim();
        // "1h 30min", "2h30"
        const hm = s.match(/(\d+)\s*h\s*(\d+)/);
        if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
        // "1.5h", "2.5 h"
        const hdec = s.match(/([\d.,]+)\s*h/);
        if (hdec) return Math.round(parseFloat(hdec[1].replace(',', '.')) * 60);
        // "90 min", "45min"
        const min = s.match(/(\d+)\s*min/);
        if (min) return parseInt(min[1]);
        // "2 horas", "1.5 horas"
        const hora = s.match(/([\d.,]+)\s*hora/);
        if (hora) return Math.round(parseFloat(hora[1].replace(',', '.')) * 60);
        // número simples
        const n = parseFloat(s.replace(',', '.'));
        if (!isNaN(n)) return Math.round(n * 60);
        return 60;
    }

    function calcEndTime(start, durationStr) {
        const [h, m]   = start.split(':').map(Number);
        const totalMin = h * 60 + m + durStrToMin(durationStr);
        return String(Math.floor(totalMin / 60) % 24).padStart(2,'0') + ':' + String(totalMin % 60).padStart(2,'0');
    }

    // Calcula a próxima hora disponível com base nas atividades do dia
    function getNextAvailableTime(dayIdx) {
        const acts = days[dayIdx].activities;
        if (!acts.length) return '09:00';
        const sorted = [...acts].sort((a, b) => a.time.localeCompare(b.time));
        const last   = sorted[sorted.length - 1];
        // Se tem timeEnd usa-o diretamente
        if (last.timeEnd) return last.timeEnd;
        // Senão calcula a partir da duração
        return calcEndTime(last.time, last.duration || '1 hora');
    }


    /* ══════════════════════════════════
       GUARDAR ROTEIRO
    ══════════════════════════════════ */
    document.getElementById('saveItineraryBtn').addEventListener('click', async function () {
        const totalActivities = days.reduce((sum, d) => sum + d.activities.length, 0);
        if (totalActivities === 0) {
            showToast((window._mr && window._mr.saveFirst) || 'Add at least one activity before saving.', 'error');
            return;
        }

        this.disabled    = true;
        this.innerHTML   = '<i class="fa-solid fa-spinner fa-spin"></i> A guardar...';

        try {
            const res  = await fetch('/manualRoteiro/save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destination: DESTINATION, departureDate: DEP_DATE, returnDate: RET_DATE, days }),
            });
            const data = await res.json();

            if (!data.success) throw new Error(data.error);

            window.location.href = '/itinerary/' + data.itineraryId;

        } catch (err) {
            showToast((window._mr && window._mr.errorMap) || 'Error saving. Try again.', 'error');
            this.disabled  = false;
            this.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + ((window._mr && window._mr.save) || 'Save Itinerary');
        }
    });


    /* ══════════════════════════════════
       MAPA DO DIA
    ══════════════════════════════════ */
    var dayMap = null;

    async function openDayMap(dayIdx) {
        var overlay   = document.getElementById('mapModalOverlay');
        var loading   = document.getElementById('mapLoading');
        var container = document.getElementById('dayMapContainer');
        var title     = document.getElementById('mapModalTitle');

        var day = days[dayIdx];
        if (!day || day.activities.length === 0) return;

        title.textContent = ((window._mr && window._mr.dayRoute) || 'Day Route') + ' — ' + (day.title || ((window._mr && window._mr.day) || 'Day') + ' ' + (dayIdx + 1));
        overlay.classList.add('open');
        loading.style.display   = 'flex';
        container.style.display = 'none';

        if (dayMap) { dayMap.remove(); dayMap = null; }

        try {
            var res  = await fetch('/manualRoteiro/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activities: day.activities, destination: DESTINATION })
            });
            var data = await res.json();
            var points = data.points.filter(function(p) { return p.found; });

            loading.style.display   = 'none';
            container.style.display = 'block';

            dayMap = L.map('dayMapContainer');
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap contributors © CARTO',
                subdomains: 'abcd', maxZoom: 20
            }).addTo(dayMap);

            if (points.length === 0) {
                container.style.cssText = 'height:500px;display:flex;align-items:center;justify-content:center;';
                container.innerHTML = '<p style="color:#7d8fa9;font-size:.85rem;">' + ((window._mr && window._mr.errorMap) || 'Could not find locations.') + '</p>';
                return;
            }

            var typeColors = {
                visita: '#60a5fa', refeicao: '#4ade80',
                transporte: '#c084fc', lazer: '#fca311', alojamento: '#fb7185'
            };
            var segmentColors = ['#fca311', '#60a5fa', '#4ade80', '#f472b6', '#c084fc', '#fb923c', '#34d399'];

            var bounds = [];
            var latlngs = [];

            points.forEach(function(p, i) {
                var color = typeColors[p.type] || '#fca311';
                var icon = L.divIcon({
                    html: '<div style="background:' + color + ';color:#000;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);">' + (i+1) + '</div>',
                    iconSize: [28,28], iconAnchor: [14,14], className: ''
                });
                L.marker([p.lat, p.lon], { icon: icon })
                    .bindPopup('<div style="font-family:Inter,sans-serif;min-width:140px;"><div style="font-weight:700;font-size:.88rem;margin-bottom:4px;">' + p.name + '</div>' + (p.time ? '<div style="font-size:.75rem;color:#888;">' + p.time + '</div>' : '') + '</div>')
                    .addTo(dayMap);
                bounds.push([p.lat, p.lon]);
                latlngs.push([p.lat, p.lon]);
            });

            if (latlngs.length > 1) {
                for (var si = 0; si < latlngs.length - 1; si++) {
                    (function(i) {
                        var segCoords = latlngs[i][1] + ',' + latlngs[i][0] + ';' + latlngs[i+1][1] + ',' + latlngs[i+1][0];
                        var color = segmentColors[i % segmentColors.length];
                        fetch('/manualRoteiro/route?coords=' + encodeURIComponent(segCoords))
                            .then(function(r) { return r.json(); })
                            .then(function(d) {
                                if (d.routes && d.routes[0] && d.routes[0].geometry && d.routes[0].geometry.coordinates && d.routes[0].geometry.coordinates.length > 1) {
                                    var routeLatLngs = d.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
                                    L.polyline(routeLatLngs, { color: color, weight: 4, opacity: 0.85 }).addTo(dayMap);
                                } else {
                                    L.polyline([latlngs[i], latlngs[i+1]], { color: color, weight: 3, opacity: 0.7, dashArray: '6,6' }).addTo(dayMap);
                                }
                            })
                            .catch(function() {});
                    })(si);
                }
            }

            dayMap.fitBounds(bounds, { padding: [40, 40] });

        } catch(e) {
            console.error('Map error:', e);
            loading.innerHTML = '<p style="color:#fb7185;font-size:.85rem;">Erro ao carregar o mapa.</p>';
        }
    }

    window.closeMapModal = function() {
        document.getElementById('mapModalOverlay').classList.remove('open');
    };

    document.getElementById('mapModalOverlay')?.addEventListener('click', function(e) {
        if (e.target === this) window.closeMapModal();
    });


    /* ══════════════════════════════════
       TOAST
    ══════════════════════════════════ */
    function showToast(msg, type = 'success') {
        const wrap  = document.getElementById('toastWrap');
        const toast = document.createElement('div');
        toast.className = `toast-msg ${type}`;
        toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i> ${msg}`;
        wrap.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

});