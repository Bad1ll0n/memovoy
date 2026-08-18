// --- Configurações Iniciais ---
const urlParams = new URLSearchParams(window.location.search);
const departureDateStr = urlParams.get("departureDate");
const returnDateStr = urlParams.get("returnDate");
let departureDate = new Date(departureDateStr);
let returnDate = new Date(returnDateStr);
let currentDate = new Date(departureDate);

// Armazena dados: chave = Data (YYYY-MM-DD), valor = Array de objetos {name, lat, lng, duration}
let calendarData = {};
let markers = []; // Array simples para limpar fácil
let map;

// Hora de início do dia (em minutos, ex: 9:00 = 540)
const START_OF_DAY_MINUTES = 9 * 60;

// --- Funções de Data ---
function formatDate(date) {
    return date.toISOString().split("T")[0];
}

function updateDateLabel() {
    const label = document.getElementById("currentDate");
    if (label) label.textContent = currentDate.toLocaleDateString("pt-BR");
}

function changeDay(offset) {
    // Não precisamos chamar saveCurrentDayData() aqui explicitamente
    // pois os dados já são atualizados no array calendarData em tempo real
    // quando adicionamos/removemos itens.

    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + offset);

    if (newDate < departureDate || newDate > returnDate) return;

    currentDate = newDate;
    updateDateLabel();
    renderTimeline();
}

// --- Lógica da Timeline e Renderização ---

// Helper: Converte minutos totais (ex: 570) para string "09:30"
function minutesToTimeStr(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function renderTimeline() {
    const container = document.getElementById("day-calendar");
    const dateKey = formatDate(currentDate);

    // Garante que existe um array para este dia
    if (!calendarData[dateKey]) calendarData[dateKey] = [];
    const events = calendarData[dateKey];

    container.innerHTML = ""; // Limpa visualização

    // Limpa marcadores do mapa
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    if (events.length === 0) {
        container.innerHTML = `<div class="text-center text-muted mt-5" id="empty-message">Arraste as atrações para cá. O horário será calculado automaticamente.</div>`;
        return;
    }

    let currentMinutes = START_OF_DAY_MINUTES;

    events.forEach((event, index) => {
        // --- CÁLCULO DOS HORÁRIOS ---
        const startTime = minutesToTimeStr(currentMinutes);
        const duration = parseInt(event.duration) || 60; // Padrão 60 min
        const endMinutes = currentMinutes + duration;
        const endTime = minutesToTimeStr(endMinutes);

        // --- A CORREÇÃO MÁGICA ESTÁ AQUI ---
        // Salvamos o horário calculado dentro do objeto de dados
        // Sem isso, a próxima página não sabe o horário do evento
        event.time = startTime;
        event.endTime = endTime;
        // ------------------------------------

        // Cria Elemento HTML
        const itemDiv = document.createElement("div");
        itemDiv.className = "timeline-item";
        itemDiv.innerHTML = `
                <div class="time-column">
                    <span>${startTime}</span>
                    <small class="text-muted">até ${endTime}</small>
                </div>
                <div class="content-column">
                    <h6 class="mb-1">${event.name}</h6>
                    <div class="d-flex align-items-center">
                        <label class="small text-muted mb-0">Duração (min):</label>
                        <input type="number" class="duration-input form-control form-control-sm ms-2 me-2" style="width: 70px;" value="${duration}" min="15" step="15" data-index="${index}">
                        <button class="btn btn-sm text-danger ms-auto remove-btn" data-index="${index}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;

        container.appendChild(itemDiv);

        // Adiciona marcador no mapa
        if (event.lat && event.lng) {
            const marker = L.marker([event.lat, event.lng])
                .addTo(map)
                .bindPopup(`<b>${event.name}</b><br>Chegada: ${startTime}<br>Saída: ${endTime}`);
            markers.push(marker);
        }

        // Atualiza tempo para o próximo loop
        currentMinutes = endMinutes;
    });

    attachTimelineEvents();
}

function attachTimelineEvents() {
    // Eventos para input de duração
    document.querySelectorAll(".duration-input").forEach(input => {
        input.addEventListener("change", (e) => {
            const index = e.target.dataset.index;
            const newDuration = parseInt(e.target.value);
            const dateKey = formatDate(currentDate);

            if (newDuration > 0) {
                calendarData[dateKey][index].duration = newDuration;
                renderTimeline(); // Recalcula tudo
            }
        });
    });

    // Eventos para remover item
    document.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const index = e.target.closest("button").dataset.index;
            const dateKey = formatDate(currentDate);
            calendarData[dateKey].splice(index, 1); // Remove do array
            renderTimeline();
        });
    });
}

// --- Drag and Drop Logic ---

function setupDropZone() {
    const container = document.getElementById("day-calendar");

    container.addEventListener("dragover", (e) => {
        e.preventDefault();
        container.style.borderColor = "#0d6efd";
        container.style.background = "#f0f8ff";
    });

    container.addEventListener("dragleave", () => {
        container.style.borderColor = "#ccc";
        container.style.background = "#fff";
    });

    container.addEventListener("drop", (e) => {
        e.preventDefault();
        container.style.borderColor = "#ccc";
        container.style.background = "#fff";

        const rawData = e.dataTransfer.getData("application/json");
        if (!rawData) return;

        const data = JSON.parse(rawData);
        const dateKey = formatDate(currentDate);

        if (!calendarData[dateKey]) calendarData[dateKey] = [];

        // Adiciona novo evento ao final do dia com duração padrão de 60 min
        calendarData[dateKey].push({
            name: data.name,
            lat: parseFloat(data.lat),
            lng: parseFloat(data.lng),
            duration: 90 // Duração padrão sugerida (1h30)
        });

        renderTimeline();
    });
}

// --- Integração API e Sidebar (Mantida e Adaptada) ---

async function fetchPontosTuristicos() {
    try {
        console.log("Buscando pontos turísticos..."); // Debug no Console (F12)

        // VERIFIQUE SE A PORTA ESTÁ CORRETA (3000, 3001, 8080?)
        const response = await fetch("http://localhost:3000/pontos-turisticos");

        if (!response.ok) throw new Error(`Erro API: ${response.status}`);

        const pontos = await response.json();
        console.log("Pontos carregados:", pontos); // Veja se aparece algo no console

        if (pontos.length === 0) {
            alert("A API retornou 0 pontos turísticos.");
            return;
        }

        const categorias = {};

        // Agrupar pontos turísticos por categoria
        // CERTIFIQUE-SE QUE SUA API RETORNA O CAMPO 'type'
        pontos.forEach((ponto) => {
            const tipo = ponto.type || "Outros"; // Fallback se não tiver tipo
            if (!categorias[tipo]) categorias[tipo] = [];
            categorias[tipo].push(ponto);
        });

        const sidebarContainer = document.getElementById("cards-container");
        sidebarContainer.innerHTML = ""; // Limpa lista antiga

        // Cria o HTML das categorias (Estilo Lista Aberta)
        Object.keys(categorias).forEach((type) => {

            // 1. Título da Categoria
            const categoryTitle = document.createElement("div");
            categoryTitle.className = "mt-3 mb-2 fw-bold text-primary border-bottom pb-1 w-100";
            categoryTitle.innerHTML = `<i class="fas fa-map-marker-alt me-2"></i>${type}`;
            sidebarContainer.appendChild(categoryTitle);

            // 2. Container dos Cards
            const cardList = document.createElement("div");
            cardList.className = "d-flex flex-column gap-2"; // Espaçamento entre cards

            categorias[type].forEach((ponto) => {
                // ATENÇÃO AOS NOMES DOS CAMPOS DA SUA API
                // Se a API retornar 'lat' em vez de 'latitude', ajuste aqui
                const lat = ponto.latitude || ponto.lat;
                const lng = ponto.longitude || ponto.lng;
                const nome = ponto.name || ponto.nome;
                const endereco = ponto.address || ponto.endereco || "";
                const foto = ponto.imagem || ponto.thumbnail || ponto.image_url;

                createDraggableCard(ponto.name, ponto.address, ponto.latitude, ponto.longitude, cardList, foto);
            });

            sidebarContainer.appendChild(cardList);
        });

    } catch (error) {
        console.error("Erro fatal:", error);
        document.getElementById("cards-container").innerHTML =
            `<div class="alert alert-danger">Erro ao carregar atrações: ${error.message}<br>Verifique se o servidor está rodando.</div>`;
    }
}

function createDraggableCard(name, address, lat, lng, container, imageUrl) {
    const card = document.createElement("div");
    card.className = "card_destino";
    card.draggable = true;

    // Limpa o nome para o URL não quebrar (remove espaços e caracteres especiais)
    const searchTerms = encodeURIComponent(name);
    const fallbackImg = `https://images.unsplash.com/photo-1555881400-74d7acaacd8b?q=80&w=150&h=150&auto=format&fit=crop`; // Imagem padrão de Portugal

    // Se não houver imagem, usa uma busca dinâmica ou o fallback fixo
    const imgPath = imageUrl || `https://source.unsplash.com/150x150/?portugal,${searchTerms}`;

    card.innerHTML = `
        <div class="drag-handle text-muted">
            <i class="fas fa-grip-vertical"></i>
        </div>
        <div class="card-img-wrapper">
            <img src="${imgPath}" alt="${name}" 
                 onerror="this.onerror=null; this.src='${fallbackImg}';">
        </div>
        <div class="card-info">
            <h6 class="text-primary">${name}</h6>
            <p class="small"><i class="fas fa-map-marker-alt"></i> ${address}</p>
        </div>
    `;

    container.appendChild(card);

    // Eventos de Drag & Drop
    card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/json", JSON.stringify({ name, lat, lng }));
        card.style.opacity = "0.4";
        card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
        card.style.opacity = "1";
        card.classList.remove("dragging");
    });
}

// --- Inicialização ---

document.addEventListener("DOMContentLoaded", () => {
    updateDateLabel();

    // Mapa
    map = L.map('map').setView([38.736946, -9.142685], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Listeners dos botões de dia
    document.getElementById("prevDay").addEventListener("click", () => changeDay(-1));
    document.getElementById("nextDay").addEventListener("click", () => changeDay(1));

    // Listener Reset
    document.getElementById("resetCalendar").addEventListener("click", () => {
        const dateKey = formatDate(currentDate);
        calendarData[dateKey] = [];
        renderTimeline();
    });

    // Listener Salvar
    document.getElementById("continuePage").addEventListener("click", () => {
    // 1. Verifica se o calendário tem dados
    if (Object.keys(calendarData).length === 0) {
        alert("O roteiro está vazio!");
        return;
    }

    // 2. Guarda os dados atuais (substituindo os antigos)
    localStorage.setItem("selectedEvents", JSON.stringify(calendarData));
    
    // 3. Redireciona para o resumo
    window.location.href = "resumoRoteiro"; 
});

    setupDropZone();
    fetchPontosTuristicos();

    // Carrega dados salvos anteriormente (para não perder dias anteriores ao editar um novo)
    const savedData = localStorage.getItem("selectedEvents");
    if (savedData) {
        calendarData = JSON.parse(savedData);
        console.log("Dados restaurados:", calendarData);
    }

    // Renderiza a timeline do dia atual
    renderTimeline();
});
