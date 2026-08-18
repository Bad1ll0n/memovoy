/* ============================================================
   itinerary.js
   - Tabs dos dias
   - Drag & drop com recálculo de horas em cascata
   - Edição de duração com recálculo em cascata
   - Painel de sugestões (Trocar atividade)
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

    /* ── Dados passados via window.* e elemento hidden ── */
    const daysEl = document.getElementById('itinerary-data');
    window.ITINERARY_DAYS = daysEl ? JSON.parse(daysEl.textContent) : [];


    /* ══════════════════════════════════
       TABS DOS DIAS
    ══════════════════════════════════ */
    const dayTabs   = document.querySelectorAll('.day-tab');
    const dayPanels = document.querySelectorAll('.day-panel');

    function showDay(idx) {
        dayPanels.forEach((p, i) => p.classList.toggle('active', i === idx));
        dayTabs.forEach((t, i)   => t.classList.toggle('active', i === idx));
    }

    dayTabs.forEach(tab => {
        tab.addEventListener('click', function () { showDay(parseInt(this.dataset.day)); });
    });

    document.getElementById('printBtn')?.addEventListener('click', () => window.print());


    /* ══════════════════════════════════
       MODAL GUARDAR ROTEIRO
    ══════════════════════════════════ */
    const saveBtn         = document.getElementById('saveItineraryBtn');
    const saveOverlay     = document.getElementById('saveModalOverlay');
    const saveCancelBtn   = document.getElementById('saveCancelBtn');
    const saveConfirmBtn  = document.getElementById('saveConfirmBtn');
    const saveTitleInput  = document.getElementById('saveTitleInput');
    const saveCharCount   = document.getElementById('saveCharCount');
    const saveError       = document.getElementById('saveError');

    function openSaveModal() {
        // Pré-preenche com o destino + datas como sugestão
        if (saveTitleInput && !saveTitleInput.value) {
            const days  = window.ITINERARY_DAYS;
            const dest  = document.querySelector('.dest-item .val')?.textContent?.trim() || '';
            const dates = document.querySelector('.trip-dates')?.textContent?.trim() || '';
            saveTitleInput.value      = dest ? `Roteiro em ${dest}` : '';
            if (saveCharCount) saveCharCount.textContent = saveTitleInput.value.length;
        }
        if (saveError) saveError.style.display = 'none';
        saveOverlay?.classList.add('open');
        saveTitleInput?.focus();
        saveTitleInput?.select();
    }

    function closeSaveModal() {
        saveOverlay?.classList.remove('open');
    }

    saveBtn?.addEventListener('click', openSaveModal);
    saveCancelBtn?.addEventListener('click', closeSaveModal);
    saveOverlay?.addEventListener('click', e => { if (e.target === saveOverlay) closeSaveModal(); });

    saveTitleInput?.addEventListener('input', function () {
        saveCharCount.textContent = this.value.length;
    });

    saveTitleInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveConfirmBtn?.click();
    });

    saveConfirmBtn?.addEventListener('click', async function () {
        const title = saveTitleInput?.value.trim();

        saveError.style.display = 'none';
        if (!title) {
            saveError.textContent   = (window._itin && window._itin.titleRequiredMsg) || 'Please give a title to your itinerary.';
            saveError.style.display = 'block';
            saveTitleInput?.focus();
            return;
        }

        saveConfirmBtn.disabled   = true;
        saveConfirmBtn.innerHTML  = '<i class="fa-solid fa-spinner fa-spin"></i> ' + ((window._itin && window._itin.saveChanges) || 'Saving...');

        try {
            const res  = await fetch(`/itinerary/${window.ITINERARY_ID}/save`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ title }),
            });
            const data = await res.json();

            if (!data.success) throw new Error(data.error || 'Erro ao guardar.');

            // Atualiza ID em memória e URL para o UUID da BD
            if (data.newId) {
                window.ITINERARY_ID = data.newId;
                window.history.replaceState(null, '', `/itinerary/${data.newId}`);
            }

            // Atualiza o botão no header
            const saveItinBtn = document.getElementById('saveItineraryBtn');
            if (saveItinBtn) {
                saveItinBtn.outerHTML = `<span class="btn-tool" style="border-color:#4ade80;color:#4ade80;cursor:default;">
                    <i class="fa-solid fa-circle-check"></i> Guardado
                </span>`;
            }
            closeSaveModal();

        } catch (err) {
            saveError.textContent   = err.message || 'Erro ao guardar. Tenta novamente.';
            saveError.style.display = 'block';
            saveConfirmBtn.disabled  = false;
            saveConfirmBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar';
        }
    });


    /* ══════════════════════════════════
       HELPERS DE TEMPO
    ══════════════════════════════════ */

    /* Converte "HH:MM" → minutos */
    function timeToMin(t) {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + (m || 0);
    }

    /* Converte minutos → "HH:MM" */
    function minToTime(min) {
        const h = Math.floor(min / 60) % 24;
        const m = min % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }

    /* Converte string de duração (ex: "2 horas", "1h30", "90 min") → minutos */
    function durToMin(dur) {
        if (!dur) return 60;
        const s = String(dur).toLowerCase().trim();

        // "1h 30min", "2h30", "1h30m", "1h 30" — horas inteiras com minutos
        const hm = s.match(/(\d+)\s*h\s*(\d+)/);
        if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);

        // "1.5h", "2.5 h", "1,5h" — horas decimais com h
        const hdec = s.match(/([\d.,]+)\s*h/);
        if (hdec) return Math.round(parseFloat(hdec[1].replace(',', '.')) * 60);

        // "90 min", "45min", "15 minutos"
        const min = s.match(/(\d+)\s*min/);
        if (min) return parseInt(min[1]);

        // "2 horas", "1.5 horas", "3 hora"
        const hora = s.match(/([\d.,]+)\s*hora/);
        if (hora) return Math.round(parseFloat(hora[1].replace(',', '.')) * 60);

        // número simples → assume horas (ex: "2", "1.5")
        const n = parseFloat(s.replace(',', '.'));
        if (!isNaN(n)) return Math.round(n * 60);

        return 60;
    }

    /* Converte minutos → string legível ("2h", "1h 30min", "45min") */
    function minToDurStr(min) {
        if (min <= 0) return '—';
        const h = Math.floor(min / 60);
        const m = min % 60;
        if (h === 0) return `${m}min`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}min`;
    }

    /* Recalcula horas de todas as atividades de um dia a partir de um índice */
    function recalculateTimes(dayIndex, fromIndex = 0) {
        const acts = window.ITINERARY_DAYS[dayIndex].activities;
        if (!acts.length) return;

        // Recalcula todas as atividades a partir de fromIndex+1 (a de fromIndex mantém a hora)
        for (let i = fromIndex + 1; i < acts.length; i++) {
            const prev     = acts[i - 1];
            const prevStart = timeToMin(prev.time);
            const prevDur   = durToMin(prev.duration);
            acts[i].time    = minToTime(prevStart + prevDur);
        }

        // Atualiza DOM
        acts.forEach((act, i) => {
            const timeEl = document.getElementById(`act-time-${dayIndex}-${i}`);
            if (timeEl) timeEl.textContent = act.time;
        });
    }


    /* ══════════════════════════════════
       MODAL PARTILHAR ROTEIRO
    ══════════════════════════════════ */
    const shareBtn          = document.getElementById('shareItineraryBtn');
    const shareOverlay      = document.getElementById('shareModalOverlay');
    const shareCancelBtn    = document.getElementById('shareCancelBtn');
    const shareConfirmBtn   = document.getElementById('shareConfirmBtn');
    const shareDescInput    = document.getElementById('shareDescInput');
    const sharePhotosInput  = document.getElementById('sharePhotosInput');
    const sharePhotosPreview= document.getElementById('sharePhotosPreview');
    const shareError        = document.getElementById('shareError');
    const shareSuccess      = document.getElementById('shareSuccess');
    const sharePreviewTitle = document.getElementById('sharePreviewTitle');
    const sharePreviewMeta  = document.getElementById('sharePreviewMeta');

    function openShareModal() {
        // Preenche preview com info do roteiro
        if (sharePreviewTitle) {
            sharePreviewTitle.textContent = document.querySelector('.dest-item .val')?.textContent?.trim()
                ? `Roteiro em ${document.querySelector('.dest-item .val').textContent.trim()}`
                : 'Roteiro';
        }
        if (sharePreviewMeta) {
            const days = window.ITINERARY_DAYS?.length || 0;
            sharePreviewMeta.textContent = `${days} dia${days !== 1 ? 's' : ''}`;
        }
        if (shareError)   { shareError.style.display   = 'none'; }
        if (shareSuccess) { shareSuccess.style.display = 'none'; }
        if (shareDescInput) shareDescInput.value = '';
        if (sharePhotosInput) sharePhotosInput.value = '';
        if (sharePhotosPreview) sharePhotosPreview.innerHTML = '';
        shareOverlay?.classList.add('open');
    }

    function closeShareModal() { shareOverlay?.classList.remove('open'); }

    shareBtn?.addEventListener('click', openShareModal);
    shareCancelBtn?.addEventListener('click', closeShareModal);
    shareOverlay?.addEventListener('click', e => { if (e.target === shareOverlay) closeShareModal(); });

    // Preview das fotos selecionadas
    sharePhotosInput?.addEventListener('change', function () {
        if (!sharePhotosPreview) return;
        sharePhotosPreview.innerHTML = '';
        [...this.files].slice(0, 10).forEach(file => {
            const img = document.createElement('img');
            img.className = 'share-photo-thumb';
            img.src = URL.createObjectURL(file);
            sharePhotosPreview.appendChild(img);
        });
    });

    shareConfirmBtn?.addEventListener('click', async function () {
        if (shareError)   shareError.style.display   = 'none';
        if (shareSuccess) shareSuccess.style.display = 'none';

        shareConfirmBtn.disabled  = true;
        shareConfirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> A partilhar...';

        try {
            const formData = new FormData();
            formData.append('roteiro_id', window.ITINERARY_ID);
            formData.append('descricao',  shareDescInput?.value?.trim() || '');

            // Fotos são opcionais — só adiciona se houver
            if (sharePhotosInput?.files?.length > 0) {
                [...sharePhotosInput.files].forEach(f => formData.append('fotos', f));
            } else {
                // Envia ficheiro vazio placeholder para não falhar validação
                // (o controller vai ser atualizado para aceitar sem fotos)
            }

            const res  = await fetch('/criar-post', {
                method: 'POST',
                body:   formData,
            });
            const data = await res.json();

            if (!data.success) throw new Error(data.error || 'Erro ao partilhar.');

            if (shareSuccess) {
                shareSuccess.textContent   = 'Roteiro partilhado com sucesso!';
                shareSuccess.style.display = 'block';
            }
            shareConfirmBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Partilhado!';

            setTimeout(() => closeShareModal(), 1500);

        } catch (err) {
            if (shareError) {
                shareError.textContent   = err.message || 'Erro ao partilhar. Tenta novamente.';
                shareError.style.display = 'block';
            }
            shareConfirmBtn.disabled  = false;
            shareConfirmBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Partilhar';
        }
    });


    /* ══════════════════════════════════
       MODO EDIÇÃO
    ══════════════════════════════════ */
    const editModeBtn   = document.getElementById('editModeBtn');
    const saveEditBtn   = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const editBanner    = document.getElementById('editModeBanner');
    let   isEditMode    = false;
    let   snapshotDays  = null; // guarda estado antes de editar

    function enterEditMode() {
        isEditMode   = true;
        snapshotDays = JSON.parse(JSON.stringify(window.ITINERARY_DAYS));
        document.body.classList.add('edit-mode');
        enableDragOnAll();
        if (editModeBtn)   { editModeBtn.style.display   = 'none'; }
        if (saveEditBtn)   { saveEditBtn.style.display   = ''; }
        if (cancelEditBtn) { cancelEditBtn.style.display = ''; }
        if (editBanner)    { editBanner.classList.add('show'); }
    }

    function exitEditMode(save) {
        isEditMode = false;
        document.body.classList.remove('edit-mode');
        disableDragOnAll();
        if (editModeBtn)   { editModeBtn.style.display   = ''; }
        if (saveEditBtn)   { saveEditBtn.style.display   = 'none'; }
        if (cancelEditBtn) { cancelEditBtn.style.display = 'none'; }
        if (editBanner)    { editBanner.classList.remove('show'); }

        if (!save && snapshotDays) {
            window.ITINERARY_DAYS = snapshotDays;
            window.ITINERARY_DAYS.forEach(function(_, i) { recalculateTimes(i, 0); });
        }
    }

    editModeBtn?.addEventListener('click',   () => enterEditMode());
    cancelEditBtn?.addEventListener('click', () => exitEditMode(false));
    saveEditBtn?.addEventListener('click', async () => {
        saveEditBtn.disabled = true;
        saveEditBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> A guardar...';
        try {
            const res = await fetch('/itinerary/' + window.ITINERARY_ID + '/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: window.ITINERARY_DAYS })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            exitEditMode(true);
        } catch(e) {
            console.error(e);
            alert('Erro ao guardar. Tenta novamente.');
        } finally {
            saveEditBtn.disabled = false;
            saveEditBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + ((window._itin && window._itin.saveChanges) || 'Save changes');
        }
    });

    // Se já guardado começa em read-only; se não guardado drag sempre ativo
    if (document.getElementById('editModeBtn')) {
        // Roteiro guardado — começa em read-only
        disableDragOnAll();
    } else {
        // Roteiro novo — drag sempre ativo
        document.body.classList.add('edit-mode');
        enableDragOnAll();
    }


    /* ══════════════════════════════════
       DRAG & DROP
    ══════════════════════════════════ */
    let dragSrc    = null;
    let dragDayIdx = null;

    function enableDragOnAll() {
        document.querySelectorAll('.activity-item').forEach(function(el) {
            el.setAttribute('draggable', 'true');
        });
    }

    function disableDragOnAll() {
        document.querySelectorAll('.activity-item').forEach(function(el) {
            el.setAttribute('draggable', 'false');
        });
    }

    // Usa delegação de eventos no document — não precisa de re-registar após reordenar
    document.addEventListener('dragstart', function(e) {
        const item = e.target.closest('.activity-item');
        if (!item || item.getAttribute('draggable') !== 'true') return;
        dragSrc    = item;
        dragDayIdx = parseInt(item.dataset.dayIndex);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    document.addEventListener('dragend', function(e) {
        const item = e.target.closest('.activity-item');
        if (!item) return;
        item.classList.remove('dragging');
        document.querySelectorAll('.activity-item').forEach(function(i) { i.classList.remove('drag-over'); });
        dragSrc = null;
    });

    document.addEventListener('dragover', function(e) {
        const item = e.target.closest('.activity-item');
        if (!item || !dragSrc || item === dragSrc) return;
        if (parseInt(item.dataset.dayIndex) !== dragDayIdx) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.activity-item').forEach(function(i) { i.classList.remove('drag-over'); });
        item.classList.add('drag-over');
    });

    document.addEventListener('dragleave', function(e) {
        const item = e.target.closest('.activity-item');
        if (item) item.classList.remove('drag-over');
    });

    document.addEventListener('drop', function(e) {
        const destItem = e.target.closest('.activity-item');
        if (!destItem || !dragSrc || destItem === dragSrc) return;

        const srcDay  = parseInt(dragSrc.dataset.dayIndex);
        const destDay = parseInt(destItem.dataset.dayIndex);
        if (srcDay !== destDay) return;

        e.preventDefault();
        destItem.classList.remove('drag-over');

        const srcIdx  = parseInt(dragSrc.dataset.actIndex);
        const destIdx = parseInt(destItem.dataset.actIndex);
        if (srcIdx === destIdx) return;

        // ── 1. Reordena o DOM ──
        const list = document.getElementById('act-list-' + srcDay);
        if (srcIdx < destIdx) {
            list.insertBefore(dragSrc, destItem.nextSibling);
        } else {
            list.insertBefore(dragSrc, destItem);
        }

        // ── 2. Atualiza data-act-index e IDs conforme a nova ordem no DOM ──
        const newOrder = list.querySelectorAll('.activity-item');
        newOrder.forEach(function(el, i) {
            el.dataset.actIndex = i;
            el.querySelectorAll('[data-act]').forEach(function(b) { b.dataset.act = i; });
            el.querySelectorAll('[data-act-index]').forEach(function(b) { b.dataset.actIndex = i; });
            var t = el.querySelector('.act-time');    if (t) t.id = 'act-time-'  + srcDay + '-' + i;
            var p = el.querySelector('.dur-edit-popup'); if (p) p.id = 'dur-popup-' + srcDay + '-' + i;
            var t = el.querySelector('.dur-input-text'); if (t) t.id = 'dur-text-' + srcDay + '-' + i;
            var d = el.querySelector('.act-dur-label'); if (d) d.id = 'dur-label-' + srcDay + '-' + i;
        });

        // ── 3. Sincroniza o array com a nova ordem DOM ──
        var acts = window.ITINERARY_DAYS[srcDay].activities;
        var startTime = acts[0].time;
        var newActs = [];
        newOrder.forEach(function(el, i) {
            // Lê a duração do DOM (pode ter sido editada)
            var durLabel = el.querySelector('.act-dur-label');
            var oldIdx = parseInt(el.dataset.actIndex);
            // Encontra o objeto original pelo nome da atividade no DOM
            var nameEl = el.querySelector('.act-name');
            var name   = nameEl ? nameEl.textContent.trim() : '';
            var found  = acts.find(function(a) { return a.name === name; }) || acts[i] || {};
            newActs.push(Object.assign({}, found));
        });
        // O primeiro mantém a hora original de início do dia
        newActs[0].time = startTime;
        window.ITINERARY_DAYS[srcDay].activities = newActs;

        // ── 4. Recalcula horas em cascata ──
        recalculateTimes(srcDay, 0);

        // Não persiste automaticamente — só guarda quando o utilizador clica guardar
    });

    function initDragDrop() {
        // Nada a fazer — eventos são delegados no document
    }


    /* ══════════════════════════════════
       EDITAR DURAÇÃO
    ══════════════════════════════════ */
    document.addEventListener('click', function (e) {

        // Abre popup
        const editBtn = e.target.closest('.btn-edit-dur');
        if (editBtn) {
            const day = editBtn.dataset.day;
            const act = editBtn.dataset.act;
            document.querySelectorAll('.dur-edit-popup.open').forEach(p => p.classList.remove('open'));
            const popup = document.getElementById('dur-popup-' + day + '-' + act);
            popup?.classList.toggle('open');
            // Foca no input de texto
            setTimeout(function() {
                var inp = document.getElementById('dur-text-' + day + '-' + act);
                if (inp) { inp.focus(); inp.select(); }
            }, 50);
            return;
        }

        // Guarda nova duração e recalcula
        const saveBtn = e.target.closest('.btn-save-dur');
        if (saveBtn) {
            const dayIdx   = parseInt(saveBtn.dataset.day);
            const actIdx   = parseInt(saveBtn.dataset.act);
            const textVal  = document.getElementById('dur-text-' + dayIdx + '-' + actIdx)?.value?.trim() || '';
            const totalMin = durToMin(textVal);

            if (totalMin <= 0) return;

            const durStr = textVal || minToDurStr(totalMin);

            // Atualiza no array
            window.ITINERARY_DAYS[dayIdx].activities[actIdx].duration = durStr;

            // Atualiza label no DOM
            const label = document.getElementById(`dur-label-${dayIdx}-${actIdx}`);
            if (label) label.innerHTML = `<i class="fa-regular fa-clock"></i> ${durStr}`;

            // Recalcula horas das atividades seguintes
            recalculateTimes(dayIdx, actIdx);

            // Fecha popup
            document.getElementById(`dur-popup-${dayIdx}-${actIdx}`)?.classList.remove('open');

            // Feedback
            const item = document.querySelector(`.activity-item[data-day-index="${dayIdx}"][data-act-index="${actIdx}"]`);
            if (item) {
                item.querySelector('.act-card').style.borderColor = '#60a5fa';
                setTimeout(() => { item.querySelector('.act-card').style.borderColor = ''; }, 1500);
            }
            return;
        }

        // Cancela
        const cancelBtn = e.target.closest('.btn-cancel-dur');
        if (cancelBtn) {
            document.getElementById('dur-popup-' + cancelBtn.dataset.day + '-' + cancelBtn.dataset.act)?.classList.remove('open');
        }
    });

    // Enter no input de duração → guardar
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        const inp = e.target.closest('.dur-input-text');
        if (!inp) return;
        const parts = inp.id.replace('dur-text-', '').split('-');
        const day = parts[0], act = parts[1];
        document.querySelector('.btn-save-dur[data-day="' + day + '"][data-act="' + act + '"]')?.click();
    });


    /* ══════════════════════════════════
       PERSISTÊNCIA
    ══════════════════════════════════ */
    async function saveDay(dayIndex) {
        try {
            await fetch(`/itinerary/${window.ITINERARY_ID}/reorder`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    dayIndex,
                    activities: window.ITINERARY_DAYS[dayIndex].activities,
                }),
            });
        } catch (err) {
            console.error('[Save] Erro:', err);
        }
    }


    /* ══════════════════════════════════
       PAINEL DE SUGESTÕES (Trocar)
    ══════════════════════════════════ */
    const overlay        = document.getElementById('suggestionsOverlay');
    const closeBtn       = document.getElementById('closeSuggestionsBtn');
    const currentActName = document.getElementById('currentActivityName');
    const loadingEl      = document.getElementById('suggestionsLoading');
    const alternativesEl = document.getElementById('alternativesList');
    const confirmBtn     = document.getElementById('confirmSwapBtn');

    let pendingSwap = null;

    function openPanel(activityName) {
        currentActName.textContent   = activityName;
        loadingEl.style.display      = 'block';
        alternativesEl.style.display = 'none';
        alternativesEl.innerHTML     = '';
        confirmBtn.classList.remove('visible');
        overlay.classList.add('open');
    }

    function closePanel() { overlay.classList.remove('open'); }

    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

    function typeBadge(type) {
        const _t = window._itin || {};
        const map = {
            visita:     { cls: 'type-visita',     label: (_t.typeVisit     || 'Visit') },
            refeicao:   { cls: 'type-refeicao',   label: (_t.typeMeal      || 'Meal') },
            transporte: { cls: 'type-transporte', label: (_t.typeTransport || 'Transport') },
            lazer:      { cls: 'type-lazer',       label: (_t.typeLeisure  || 'Leisure') },
            alojamento: { cls: 'type-alojamento', label: (_t.typeAccom     || 'Accommodation') },
        };
        const t = map[type] || { cls: 'type-lazer', label: type };
        return `<span class="alt-badge act-type-badge ${t.cls}">${t.label}</span>`;
    }

    function renderAlternatives(alternatives) {
        loadingEl.style.display      = 'none';
        alternativesEl.style.display = 'block';
        alternativesEl.innerHTML     = '';

        alternatives.forEach(alt => {
            const card = document.createElement('div');
            card.className = 'alt-card';
            card.innerHTML = `
                <div class="alt-card-header">
                    <span class="alt-name">${alt.name}</span>
                    ${typeBadge(alt.type)}
                </div>
                <div class="alt-desc">${alt.description}</div>
                <div class="alt-meta">
                    <span><i class="fa-regular fa-clock"></i> ${alt.duration || '—'}</span>
                    <span><i class="fa-solid fa-euro-sign"></i> ${alt.estimatedCost || '—'}</span>
                </div>
                ${alt.tip ? `<div class="act-tip" style="margin-bottom:8px"><i class="fa-solid fa-lightbulb"></i>${alt.tip}</div>` : ''}
                <div class="alt-why"><i class="fa-solid fa-circle-check"></i> ${alt.whyThisOne || ''}</div>`;

            card.addEventListener('click', function (e) {
                e.stopPropagation();
                alternativesEl.querySelectorAll('.alt-card').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
                if (pendingSwap) pendingSwap.selectedAlt = alt;
                confirmBtn.classList.add('visible');
            });

            alternativesEl.appendChild(card);
        });
    }

    document.addEventListener('click', async function (e) {
        const swapBtn = e.target.closest('.btn-swap');
        if (!swapBtn) return;

        const dayIndex = parseInt(swapBtn.dataset.dayIndex);
        const actIndex = parseInt(swapBtn.dataset.actIndex);
        const activity = window.ITINERARY_DAYS[dayIndex].activities[actIndex];

        pendingSwap = { dayIndex, actIndex, selectedAlt: null };
        openPanel(activity.name);

        try {
            const res  = await fetch(`/itinerary/${window.ITINERARY_ID}/suggest`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ activity }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || (window._itin && window._itin.errorSuggest) || 'Error generating suggestions');
            renderAlternatives(data.alternatives);
        } catch (err) {
            loadingEl.innerHTML = `<p style="color:#fb7185;font-size:.85rem">Erro ao carregar alternativas.<br>Tenta novamente.</p>`;
        }
    });

    confirmBtn.addEventListener('click', async function () {
        if (!pendingSwap?.selectedAlt) return;
        const { dayIndex, actIndex, selectedAlt } = pendingSwap;

        try {
            const res  = await fetch(`/itinerary/${window.ITINERARY_ID}/activity`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ dayIndex, activityIndex: actIndex, newActivity: selectedAlt }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            // Atualiza array e recalcula horas
            window.ITINERARY_DAYS[dayIndex].activities[actIndex] = selectedAlt;
            recalculateTimes(dayIndex, actIndex);
            updateActivityCard(dayIndex, actIndex, selectedAlt);
            closePanel();
        } catch (err) {
            alert('Erro ao guardar a troca. Tenta novamente.');
        }
    });

    function updateActivityCard(dayIndex, actIndex, newAct) {
        const item = document.querySelector(
            `.activity-item[data-day-index="${dayIndex}"][data-act-index="${actIndex}"]`
        );
        if (!item) return;

        item.querySelector(`#act-time-${dayIndex}-${actIndex}`).textContent = newAct.time;
        const card = item.querySelector('.act-card');
        card.querySelector('.act-name').textContent  = newAct.name;
        const badge = card.querySelector('.act-type-badge');
        badge.className   = `act-type-badge type-${newAct.type}`;
        badge.textContent = newAct.type;
        card.querySelector('.act-desc').textContent = newAct.description;

        const meta = card.querySelector('.act-meta');
        meta.innerHTML = '';
        if (newAct.duration)      meta.innerHTML += `<span class="act-dur-label" id="dur-label-${dayIndex}-${actIndex}"><i class="fa-regular fa-clock"></i> ${newAct.duration}</span>`;
        if (newAct.estimatedCost) meta.innerHTML += `<span><i class="fa-solid fa-euro-sign"></i> ${newAct.estimatedCost}</span>`;

        let tipEl = card.querySelector('.act-tip');
        if (newAct.tip) {
            if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'act-tip'; card.insertBefore(tipEl, card.querySelector('.act-actions')); }
            tipEl.innerHTML = `<i class="fa-solid fa-lightbulb"></i>${newAct.tip}`;
        } else if (tipEl) { tipEl.remove(); }

        card.style.borderColor = 'var(--accent)';
        setTimeout(() => { card.style.borderColor = ''; }, 1500);
    }



    /* ══════════════════════════════════
       MAPA DO DIA
    ══════════════════════════════════ */
    var dayMap = null;

    window.openDayMap = async function(dayIndex) {
        var overlay   = document.getElementById('mapModalOverlay');
        var loading   = document.getElementById('mapLoading');
        var container = document.getElementById('dayMapContainer');
        var title     = document.getElementById('mapModalTitle');

        var day = window.ITINERARY_DAYS[dayIndex];
        if (!day) return;

        title.textContent = 'Percurso — ' + (day.title || 'Dia ' + (dayIndex + 1));

        overlay.classList.add('open');
        loading.style.display   = 'flex';
        container.style.display = 'none';

        // Destroi mapa anterior se existir
        if (dayMap) { dayMap.remove(); dayMap = null; }

        try {
            // Geocodifica as atividades
            var destination = window.ITINERARY_DESTINATION || '';

            var res  = await fetch('/itinerary/' + window.ITINERARY_ID + '/geocode', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ activities: day.activities, destination: destination })
            });
            var data = await res.json();

            var points = data.points.filter(function(p) { return p.found; });

            loading.style.display   = 'none';
            container.style.display = 'block';

            // Inicializa o mapa
            dayMap = L.map('dayMapContainer');
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap contributors © CARTO',
                subdomains: 'abcd', maxZoom: 20
            }).addTo(dayMap);

            if (points.length === 0) {
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.style.justifyContent = 'center';
                container.innerHTML = '<p style="color:#7d8fa9;font-size:.85rem;">' + ((window._itin && window._itin.noLocations) || 'Could not find locations.') + '</p>';
                return;
            }

            var typeColors = {
                visita:     '#60a5fa',
                refeicao:   '#4ade80',
                transporte: '#c084fc',
                lazer:      '#fca311',
                alojamento: '#fb7185'
            };

            var bounds = [];
            var latlngs = [];

            points.forEach(function(p, i) {
                var color = typeColors[p.type] || '#fca311';
                var icon = L.divIcon({
                    html: '<div style="background:' + color + ';color:#000;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);">' + (i+1) + '</div>',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14],
                    className: ''
                });

                var marker = L.marker([p.lat, p.lon], { icon: icon }).addTo(dayMap);
                marker.bindPopup(
                    '<div style="font-family:Inter,sans-serif;min-width:160px;">' +
                    '<div style="font-weight:700;font-size:.88rem;margin-bottom:4px;">' + p.name + '</div>' +
                    (p.time ? '<div style="font-size:.75rem;color:#888;">' + p.time + '</div>' : '') +
                    '</div>'
                );

                bounds.push([p.lat, p.lon]);
                latlngs.push([p.lat, p.lon]);
            });

            // Percurso real por segmento — cor do ponto de origem
            function addRoutePolyline(latLngs, color, dashed) {
                var opts = dashed
                    ? { color: color, weight: 3, opacity: 0.7, dashArray: '6,6' }
                    : { color: color, weight: 4, opacity: 0.8 };
                var poly = L.polyline(latLngs, opts).addTo(dayMap);
                poly.on('mouseover', function() {
                    poly.setStyle({ weight: opts.weight + 3, opacity: 1 });
                    poly.bringToFront();
                });
                poly.on('mouseout', function() {
                    poly.setStyle({ weight: opts.weight, opacity: opts.opacity });
                });
            }

            if (latlngs.length > 1) {
                for (var si = 0; si < latlngs.length - 1; si++) {
                    (function(i) {
                        var color = typeColors[points[i].type] || '#fca311';
                        var segCoords = latlngs[i][1] + ',' + latlngs[i][0] + ';' + latlngs[i+1][1] + ',' + latlngs[i+1][0];
                        fetch('/itinerary/route?coords=' + encodeURIComponent(segCoords))
                            .then(function(res) { return res.json(); })
                            .then(function(data) {
                                if (data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates && data.routes[0].geometry.coordinates.length > 1) {
                                    var routeLatLngs = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
                                    addRoutePolyline(routeLatLngs, color, false);
                                } else {
                                    addRoutePolyline([latlngs[i], latlngs[i+1]], color, true);
                                }
                            })
                            .catch(function() { /* falha silenciosa */ });
                    })(si);
                }
            }

            dayMap.fitBounds(bounds, { padding: [40, 40] });

        } catch(e) {
            console.error('Map error:', e);
            loading.innerHTML = '<p style="color:#fb7185;font-size:.85rem;">Erro ao carregar o mapa.</p>';
        }
    };

    window.closeMapModal = function() {
        document.getElementById('mapModalOverlay').classList.remove('open');
    };

    document.getElementById('mapModalOverlay')?.addEventListener('click', function(e) {
        if (e.target === this) window.closeMapModal();
    });

});