// public/js/sharePhoto.js
if (window.__sharePhotoInit) { throw new Error('sharePhoto already initialized'); }
window.__sharePhotoInit = true;

/* ── Roteiros ── */
document.getElementById('sharePhotoModal').addEventListener('show.bs.modal', async () => {
    files.forEach(({ src }) => URL.revokeObjectURL(src));
    files = [];
    render();

    const sel = document.getElementById('roteiroSelect');
    sel.innerHTML = '<option value="" selected disabled>A carregar...</option>';
    try {
        const { itineraries } = await fetch('/itinerary/mine').then(r => r.json());
        sel.innerHTML = '<option value="" selected disabled>Selecionar roteiro...</option>';
        (itineraries || []).forEach(r => sel.appendChild(new Option(`${r.title} — ${r.destination}`, r.id)));
        if (!itineraries?.length) sel.innerHTML = '<option disabled>Ainda não tens roteiros guardados</option>';
    } catch { sel.innerHTML = '<option disabled>Erro ao carregar roteiros</option>'; }
});

/* ── Fotos ── */
let files = [];

document.getElementById('photoUpload').addEventListener('click', e => e.stopPropagation());

document.querySelector('.upload-area-dark').addEventListener('click', () => {
    document.getElementById('photoUpload').click();
});

document.getElementById('photoUpload').addEventListener('change', function () {
    const newFiles = [...this.files];
    this.value = '';
    newFiles.forEach(f => {
        if (files.length < 10 && !files.find(x => x.file.name === f.name && x.file.size === f.size)) {
            files.push({ file: f, src: URL.createObjectURL(f) });
        }
    });
    render();
}, { once: false });

function render() {
    const grid = document.getElementById('photoPreview');
    const count = document.getElementById('photoCount');
    const area  = document.querySelector('.upload-area-dark');

    if (count) count.textContent = files.length
        ? `${files.length} foto${files.length !== 1 ? 's' : ''} selecionada${files.length !== 1 ? 's' : ''}`
        : '';

    if (area) area.style.display = files.length ? 'none' : '';
    if (!grid) return;
    grid.innerHTML     = '';
    grid.style.display = files.length ? 'grid' : 'none';
    if (!files.length) return;

    files.forEach(({ src, edited }, i) => {
        const div = document.createElement('div');
        div.className = 'thumb';

        const img = document.createElement('img');
        img.src = src; img.alt = '';

        const btnX = document.createElement('button');
        btnX.type = 'button'; btnX.className = 'thumb-x'; btnX.textContent = '✕';
        btnX.onclick = e => { e.stopPropagation(); URL.revokeObjectURL(files[i].src); files.splice(i, 1); render(); };

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button'; btnEdit.className = 'thumb-edit'; btnEdit.title = 'Editar';
        btnEdit.innerHTML = '<i class="fa-solid fa-pen"></i>';
        btnEdit.onclick = e => { e.stopPropagation(); openEditor(i); };

        const num = document.createElement('span');
        num.className = 'thumb-n'; num.textContent = i + 1;

        div.append(img, btnX, btnEdit, num);

        if (edited) {
            const badge = document.createElement('span');
            badge.className = 'thumb-edited'; badge.textContent = 'Editado';
            div.appendChild(badge);
        }

        grid.appendChild(div);
    });

    if (files.length < 10) {
        const add = document.createElement('div');
        add.className = 'thumb-add';
        add.innerHTML = '<i class="fa-solid fa-plus" style="font-size:1rem"></i><span>Adicionar</span>';
        add.onclick = () => document.getElementById('photoUpload').click();
        grid.appendChild(add);
    }
}

/* ══════════════════════════════════════
   EDITOR — CSS transform + canvas
   ══════════════════════════════════════ */
let editingIndex = -1;
let edRotation   = 0;   // graus acumulados
let edFlipX      = 1;   // 1 ou -1
let edFlipY      = 1;

const editorOverlay = document.getElementById('photoEditorOverlay');
const editorImg     = document.getElementById('editorImg');

function openEditor(index) {
    editingIndex = index;
    edRotation = 0; edFlipX = 1; edFlipY = 1;

    ['edBrightness','edContrast','edSaturation'].forEach(id => {
        document.getElementById(id).value = 100;
        document.getElementById(id + 'Val').textContent = 100;
    });

    editorImg.style.transform = '';
    editorImg.style.filter    = '';
    editorImg.src = files[index].src;

    editorOverlay.style.display = 'flex';
}

function closeEditor() {
    editorOverlay.style.display = 'none';
    editingIndex = -1;
}

function updatePreview() {
    const b = document.getElementById('edBrightness').value;
    const c = document.getElementById('edContrast').value;
    const s = document.getElementById('edSaturation').value;
    editorImg.style.filter    = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
    editorImg.style.transform = `rotate(${edRotation}deg) scaleX(${edFlipX}) scaleY(${edFlipY})`;
}

document.getElementById('cancelEditorBtn').addEventListener('click', closeEditor);

document.getElementById('edRotateL').addEventListener('click', () => { edRotation -= 90; updatePreview(); });
document.getElementById('edRotateR').addEventListener('click', () => { edRotation += 90; updatePreview(); });

document.getElementById('edFlipH').addEventListener('click', () => { edFlipX *= -1; updatePreview(); });
document.getElementById('edFlipV').addEventListener('click', () => { edFlipY *= -1; updatePreview(); });

document.getElementById('edReset').addEventListener('click', () => {
    edRotation = 0; edFlipX = 1; edFlipY = 1;
    ['edBrightness','edContrast','edSaturation'].forEach(id => {
        document.getElementById(id).value = 100;
        document.getElementById(id + 'Val').textContent = 100;
    });
    editorImg.style.transform = '';
    editorImg.style.filter    = '';
});

['edBrightness','edContrast','edSaturation'].forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener('input', () => {
        document.getElementById(id + 'Val').textContent = input.value;
        updatePreview();
    });
});

document.getElementById('applyEditorBtn').addEventListener('click', () => {
    if (editingIndex < 0) return;

    const b = document.getElementById('edBrightness').value;
    const c = document.getElementById('edContrast').value;
    const s = document.getElementById('edSaturation').value;

    const source = new Image();
    source.onload = () => {
        // Calcular dimensões do canvas após rotação
        const rad  = (edRotation % 360 + 360) % 360;
        const swap = rad === 90 || rad === 270;
        const w = swap ? source.naturalHeight : source.naturalWidth;
        const h = swap ? source.naturalWidth  : source.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
        ctx.translate(w / 2, h / 2);
        ctx.rotate((edRotation * Math.PI) / 180);
        ctx.scale(edFlipX, edFlipY);
        ctx.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);

        canvas.toBlob(blob => {
            const original = files[editingIndex].file;
            const newFile  = new File([blob], original.name, { type: 'image/jpeg' });
            URL.revokeObjectURL(files[editingIndex].src);
            files[editingIndex] = { file: newFile, src: URL.createObjectURL(newFile), edited: true };
            closeEditor();
            render();
        }, 'image/jpeg', 0.92);
    };
    source.src = files[editingIndex].src;
});

/* ── Submit ── */
document.getElementById('share-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.querySelector('#sharePhotoModal .btn-share');
    btn.disabled = true; btn.textContent = 'A partilhar...';

    const fd = new FormData();
    fd.append('roteiro_id', document.getElementById('roteiroSelect').value || '');
    fd.append('descricao',  document.getElementById('description').value   || '');
    files.forEach(({ file }) => fd.append('fotos', file));

    try {
        const data = await fetch('/criar-post', { method: 'POST', body: fd }).then(r => r.json());
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('sharePhotoModal'))?.hide();
            files = []; render(); this.reset(); window.location.reload();
        } else {
            alert(data.error || 'Erro ao partilhar.');
            btn.disabled = false; btn.textContent = 'Partilhar';
        }
    } catch {
        alert('Erro de conexão.');
        btn.disabled = false; btn.textContent = 'Partilhar';
    }
});

/* ── Reset ao fechar ── */
document.getElementById('sharePhotoModal').addEventListener('hidden.bs.modal', function () {
    closeEditor();
    files.forEach(({ src }) => URL.revokeObjectURL(src));
    files = []; render(); document.getElementById('share-form').reset();
});
