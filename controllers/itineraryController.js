// controllers/itineraryController.js

const { runItineraryAgent, suggestAlternatives } = require('../services/itineraryAgentService');
const { randomUUID } = require('crypto'); // nativo no Node.js 14+
const itineraryStore = require('../store/itineraryStore');
const repo           = require('../db/itineraryRepository');

/* ─────────────────────────────────────────
   POST /itinerary/generate
   Gera o roteiro e guarda em memória (ainda sem título)
───────────────────────────────────────── */
async function generateItinerary(req, res) {
    try {
        const { destination, departureDate, returnDate, styles, group, budget, extras, dayStart, dayEnd, meals, transport } = req.body;

        if (!destination || !departureDate || !returnDate) {
            return res.status(400).json({ success: false, error: 'Destino e datas são obrigatórios.' });
        }
        if (new Date(returnDate) <= new Date(departureDate)) {
            return res.status(400).json({ success: false, error: 'Data de volta deve ser após a data de ida.' });
        }

        const itinerary = await runItineraryAgent({
            destination, departureDate, returnDate,
            styles:    Array.isArray(styles) ? styles : [],
            group:     group     || 'sozinho',
            budget:    parseInt(budget) || 150,
            extras:    Array.isArray(extras) ? extras : [],
            dayStart:  dayStart  || '09:00',
            dayEnd:    dayEnd    || '21:00',
            meals:     meals     || 'ambos',
            transport: transport || 'carro',
        });

        const itineraryId = randomUUID();
        itineraryStore[itineraryId] = {
            id: itineraryId,
            userId: req.user?.Guid || null,
            saved: false,   // ainda não guardado na BD
            ...itinerary,
        };

        return res.json({ success: true, itineraryId });

    } catch (err) {
        console.error('[itineraryController] Erro generate:', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Erro interno.' });
    }
}

/* ─────────────────────────────────────────
   GET /itinerary/:id
   Primeiro tenta memória, depois BD
───────────────────────────────────────── */
async function viewItinerary(req, res) {
    try {
        let itinerary = itineraryStore[req.params.id];

        let itineraryOwnerId = itinerary?.userId || null;

        if (!itinerary) {
            // Tenta carregar da BD
            const row = await repo.getItineraryById(req.params.id);
            if (!row) return res.status(404).render('404', { message: 'Roteiro não encontrado.' });
            itinerary = { ...row.data, id: row.id, title: row.title, saved: true };
            itineraryStore[req.params.id] = itinerary; // coloca em memória para edições
            itineraryOwnerId = row.user_id;
        }

        const isOwner = req.user?.Guid && itineraryOwnerId && req.user.Guid === itineraryOwnerId;
        return res.render('itinerary', { itinerary, user: req.user || {}, isOwner });
    } catch (err) {
        console.error('[itineraryController] Erro view:', err.message);
        return res.status(500).render('500', {});
    }
}

/* ─────────────────────────────────────────
   POST /itinerary/:id/save
   Recebe título e persiste na BD
───────────────────────────────────────── */
async function saveItinerary(req, res) {
    try {
        const itinerary = itineraryStore[req.params.id];
        if (!itinerary) {
            return res.status(404).json({ success: false, error: 'Roteiro não encontrado.' });
        }

        const { title } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, error: 'Título obrigatório.' });
        }
        if (title.trim().length > 200) {
            return res.status(400).json({ success: false, error: 'Título demasiado longo (máx. 200 caracteres).' });
        }

        const newId = await repo.saveItinerary({
            userId:    req.user?.Guid || itinerary.userId,
            title:     title.trim(),
            itinerary,
            isManual:  false,
        });

        // Migra a entrada em memória para o novo UUID da BD
        itineraryStore[newId] = {
            ...itineraryStore[req.params.id],
            id:    newId,
            saved: true,
            title: title.trim(),
        };
        delete itineraryStore[req.params.id];

        return res.json({ success: true, newId });

    } catch (err) {
        console.error('[itineraryController] Erro save:', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Erro interno.' });
    }
}

/* ─────────────────────────────────────────
   POST /itinerary/:id/suggest
───────────────────────────────────────── */
async function suggestActivity(req, res) {
    try {
        const itinerary = itineraryStore[req.params.id];
        if (!itinerary) {
            return res.status(404).json({ success: false, error: 'Roteiro não encontrado.' });
        }

        const { activity } = req.body;
        if (!activity) {
            return res.status(400).json({ success: false, error: 'Atividade em falta.' });
        }

        const result = await suggestAlternatives(activity, itinerary.destinationInfo, itinerary.params);
        return res.json({ success: true, alternatives: result.alternatives });

    } catch (err) {
        console.error('[itineraryController] Erro suggest:', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Erro interno.' });
    }
}

/* ─────────────────────────────────────────
   PATCH /itinerary/:id/activity
───────────────────────────────────────── */
async function replaceActivity(req, res) {
    try {
        const itinerary = itineraryStore[req.params.id];
        if (!itinerary) return res.status(404).json({ success: false, error: 'Roteiro não encontrado.' });

        const { dayIndex, activityIndex, newActivity } = req.body;
        if (dayIndex === undefined || activityIndex === undefined || !newActivity) {
            return res.status(400).json({ success: false, error: 'Parâmetros em falta.' });
        }

        const day = itinerary.days[dayIndex];
        if (!day) return res.status(400).json({ success: false, error: 'Dia não encontrado.' });

        day.activities[activityIndex] = newActivity;

        // Persiste na BD se já foi guardado
        if (itinerary.saved) await repo.updateItineraryData(req.params.id, itinerary);

        return res.json({ success: true });

    } catch (err) {
        console.error('[itineraryController] Erro replace:', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Erro interno.' });
    }
}

/* ─────────────────────────────────────────
   PATCH /itinerary/:id/reorder
───────────────────────────────────────── */
async function reorderActivities(req, res) {
    try {
        const itinerary = itineraryStore[req.params.id];
        if (!itinerary) return res.status(404).json({ success: false, error: 'Roteiro não encontrado.' });

        const { dayIndex, activities } = req.body;
        if (dayIndex === undefined || !Array.isArray(activities)) {
            return res.status(400).json({ success: false, error: 'Parâmetros em falta.' });
        }

        itinerary.days[dayIndex].activities = activities;

        // Persiste na BD se já foi guardado
        if (itinerary.saved) await repo.updateItineraryData(req.params.id, itinerary);

        return res.json({ success: true });

    } catch (err) {
        console.error('[itineraryController] Erro reorder:', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Erro interno.' });
    }
}

/* ─────────────────────────────────────────
   GET /itineraries/mine
   Lista os roteiros guardados do utilizador
───────────────────────────────────────── */
async function getMyItineraries(req, res) {
    try {
        const itineraries = await repo.getUserItineraries(req.user.Guid);
        return res.json({ success: true, itineraries });
    } catch (err) {
        console.error('[itineraryController] Erro getMyItineraries:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function updateAllDays(req, res) {
    try {
        const itinerary = itineraryStore[req.params.id];
        if (!itinerary) return res.status(404).json({ success: false, error: 'Roteiro não encontrado.' });

        const { days } = req.body;
        if (!Array.isArray(days)) return res.status(400).json({ success: false, error: 'Parâmetros em falta.' });

        itinerary.days = days;
        if (itinerary.saved) await repo.updateItineraryData(req.params.id, itinerary);

        return res.json({ success: true });
    } catch (err) {
        console.error('[itineraryController] Erro updateAllDays:', err.message);
        return res.status(500).json({ success: false, error: err.message || 'Erro interno.' });
    }
}

/* ─────────────────────────────────────────
   POST /itinerary/:id/geocode
   Geocodifica as atividades de um dia para o mapa
───────────────────────────────────────── */
async function geocodeDay(req, res) {
    try {
        const { activities, destination } = req.body;
        if (!activities || !Array.isArray(activities)) {
            return res.status(400).json({ error: 'Parâmetros em falta.' });
        }

        const nominatimGet = async (q, extraParams = '') => {
            const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=3' + extraParams;
            const response = await fetch(url, { headers: { 'User-Agent': 'InsightTravelApp/1.0' } });
            return response.json();
        };

        // Remove prefixos de ação comuns em PT para expor o nome do local
        const cleanName = (name) => name
            .replace(/^(almoço|jantar|pequeno[- ]almoço|café da manhã|lanche|refeição|brunch)\s+(em|no|na|num|numa|ao?)\s+/i, '')
            .replace(/^(visita\s+(ao?|à|aos?|às)\s+)/i, '')
            .replace(/^(deslocação|transporte|transfer|viagem)\s+(ao?|à|para|de|até)\s+/i, '')
            .replace(/^(caminhada|trilha|trilho|passeio|escalada|mergulho|rafting|surf|snorkeling|kayak|canoa|ciclismo|bike|trekking|hiking)\s+(no?|na|ao?|à|pelo?|pela|até|em|por)\s+/i, '')
            .replace(/^(check[- ]in|check[- ]out)\s+(no?|na|ao?|à|em)\s+/i, '')
            .replace(/^(piquenique|pic[- ]nic)\s+(no?|na|ao?|à|em)\s+/i, '')
            .replace(/^(noite|tarde|manhã)\s+(no?|na|ao?|à|em)\s+/i, '')
            .trim();

        // 1. Geocodificar o destino para obter coordenadas de referência
        await new Promise(r => setTimeout(r, 1100));
        const destData = await nominatimGet(destination);
        let refLat = null, refLon = null, viewbox = null;
        if (destData && destData[0]) {
            refLat = parseFloat(destData[0].lat);
            refLon = parseFloat(destData[0].lon);
            const delta = 3; // ~300km
            viewbox = `&viewbox=${refLon - delta},${refLat + delta},${refLon + delta},${refLat - delta}&bounded=1`;
        }

        // Verifica se resultado está perto do destino (~500km)
        const isNearDestination = (lat, lon) => {
            if (refLat === null) return true;
            return Math.abs(lat - refLat) < 5 && Math.abs(lon - refLon) < 5;
        };

        // Traduções de palavras de conteúdo PT→EN para nomes próprios compostos
        const wordTranslations = {
            'céu': 'heaven', 'ceu': 'heaven', 'paraíso': 'paradise',
            'mar': 'sea', 'rio': 'river', 'lago': 'lake', 'montanha': 'mountain',
            'grande': 'great', 'pequeno': 'little', 'novo': 'new', 'velho': 'old',
            'antigo': 'ancient', 'real': 'royal', 'imperial': 'imperial',
            'norte': 'north', 'sul': 'south', 'este': 'east', 'oeste': 'west',
            'central': 'central', 'nacional': 'national', 'histórico': 'historic',
        };
        const translateWords = (s) => s.split(/\s+/).map(w =>
            wordTranslations[w.toLowerCase()] || w
        ).join(' ');

        // Converte tipo de lugar PT→EN e reordena (ex: "Parque Jingshan" → "Jingshan Park")
        const translateType = (name) => {
            const t = name
                .replace(/^Parque\s+(.+)/i,    (_, r) => translateWords(r) + ' Park')
                .replace(/^Jardim\s+(.+)/i,    (_, r) => translateWords(r) + ' Garden')
                .replace(/^Museu\s+(.+)/i,     (_, r) => translateWords(r) + ' Museum')
                .replace(/^Templo\s+(d[oa]s?\s+)?(.+)/i,  (_, _a, r) => translateWords(r) + ' Temple')
                .replace(/^Palácio\s+(d[oa]s?\s+)?(.+)/i, (_, _a, r) => translateWords(r) + ' Palace')
                .replace(/^Praça\s+(d[oa]s?\s+)?(.+)/i,   (_, _a, r) => translateWords(r) + ' Square')
                .replace(/^Castelo\s+(d[oa]s?\s+)?(.+)/i, (_, _a, r) => translateWords(r) + ' Castle')
                .replace(/^Catedral\s+(d[oa]s?\s+)?(.+)/i,(_, _a, r) => translateWords(r) + ' Cathedral')
                .replace(/^Ponte\s+(.+)/i,     (_, r) => translateWords(r) + ' Bridge')
                .replace(/^Monte\s+(.+)/i,     (_, r) => translateWords(r) + ' Mountain')
                .replace(/^Mercado\s+(.+)/i,   (_, r) => translateWords(r) + ' Market')
                .replace(/^Muralha\s+(d[oa]s?\s+)?(.+)/i, (_, _a, r) => translateWords(r) + ' Wall')
                .replace(/^Torre\s+(d[oa]s?\s+)?(.+)/i,   (_, _a, r) => translateWords(r) + ' Tower')
                .trim();
            return t === name ? translateWords(name) : t;
        };

        const results = [];
        for (const act of activities) {
            const cleaned  = cleanName(act.name);
            const engName  = act.geoName || translateType(cleaned);
            let found = false;

            // Estratégias por ordem de especificidade
            const strategies = [
                { q: engName  + ', ' + destination,  params: viewbox || '' },
                { q: cleaned  + ', ' + destination,  params: viewbox || '' },
                { q: act.name + ', ' + destination,  params: viewbox || '' },
                { q: engName  + ', ' + destination,  params: '' },
                { q: cleaned  + ', ' + destination,  params: '' },
                { q: engName,                         params: viewbox || '' },
                { q: cleaned,                         params: viewbox || '' },
            ];

            for (const { q, params } of strategies) {
                try {
                    await new Promise(r => setTimeout(r, 1100));
                    const data = await nominatimGet(q, params);
                    if (data && data.length > 0) {
                        const lat = parseFloat(data[0].lat);
                        const lon = parseFloat(data[0].lon);
                        if (!isNearDestination(lat, lon)) continue;
                        results.push({ name: act.name, type: act.type, time: act.time, lat, lon, found: true });
                        found = true;
                        break;
                    }
                } catch(e) { /* tenta próxima estratégia */ }
            }

            if (!found) {
                results.push({ name: act.name, type: act.type, time: act.time, found: false });
            }
        }

        // Se nenhuma atividade foi encontrada mas temos o destino, adiciona-o como ponto central
        const foundPoints = results.filter(p => p.found);
        if (foundPoints.length === 0 && refLat !== null) {
            results[0] = { name: destination, type: 'visita', time: '', lat: refLat, lon: refLon, found: true };
        }

        res.json({ success: true, points: results });
    } catch (err) {
        console.error('geocodeDay error:', err);
        res.status(500).json({ error: 'Erro ao geocodificar.' });
    }
}

/* ─────────────────────────────────────────
   GET /itinerary/route?coords=lon,lat;lon,lat;...
   Proxy para GraphHopper
───────────────────────────────────────── */
async function getRoute(req, res) {
    try {
        const { coords } = req.query;
        if (!coords) return res.status(400).json({ error: 'coords obrigatório' });

        const apiKey = (process.env.GRAPHHOPPER_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
        console.log('[getRoute] coords:', coords, '| key length:', apiKey.length);
        if (!apiKey) { console.error('[getRoute] API key vazia'); return res.json({ routes: null }); }

        // coords vem como "lon1,lat1;lon2,lat2" — GraphHopper espera "point=lat,lon&point=lat,lon"
        const points = coords.split(';').map(c => {
            const [lon, lat] = c.split(',');
            return `point=${lat},${lon}`;
        }).join('&');

        const url = `https://graphhopper.com/api/1/route?${points}&profile=car&points_encoded=false&key=${apiKey}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'InsightTravelApp/1.0' } });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error('[getRoute] GraphHopper error', response.status, errText.slice(0, 200));
            return res.json({ routes: null });
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('json')) return res.json({ routes: null });

        const data = await response.json();
        if (!data.paths || !data.paths[0]) {
            console.error('[getRoute] GraphHopper sem paths:', JSON.stringify(data).slice(0, 200));
            return res.json({ routes: null });
        }

        // Normaliza para o formato que o frontend espera
        res.json({ routes: [{ geometry: data.paths[0].points }] });

    } catch (err) {
        res.json({ routes: null });
    }
}

module.exports = {
    generateItinerary,
    viewItinerary,
    saveItinerary,
    suggestActivity,
    replaceActivity,
    reorderActivities,
    updateAllDays,
    getMyItineraries,
    geocodeDay,
    getRoute,
};