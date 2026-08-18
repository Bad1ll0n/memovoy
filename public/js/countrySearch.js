/* --- 1. Lógica de Pesquisa com Debounce --- */
let debounceTimer;

const searchInputEl = document.getElementById("searchInput");
if (searchInputEl) {
    searchInputEl.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(search, 300);
    });
}

async function search() {
    const input = document.getElementById("searchInput");
    const resultsDiv = document.getElementById("results");
    const query = input.value.trim();

    if (query.length === 0) {
        resultsDiv.innerHTML = "";
        resultsDiv.classList.remove("show");
        return;
    }

    try {
        const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
        const rawData = await response.json();

        // Garante que 'data' seja sempre um Array
        const data = Array.isArray(rawData) ? rawData : (rawData.results || []);

        resultsDiv.innerHTML = "";

        if (data.length === 0) {
            resultsDiv.innerHTML = '<div class="p-3 text-muted text-center small">Nenhum resultado encontrado</div>';
            resultsDiv.classList.add("show");
            return;
        }

        const filteredResults = data
            .filter((item) => {
                return item.type ? item.type === "city" : true;
            })
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .slice(0, 5);

        if (filteredResults.length > 0) {
            filteredResults.forEach((item) => {
                const divItem = document.createElement("div");
                divItem.className = "result-item";

                const cityName    = item.name    || "Cidade desconhecida";
                const countryName = item.country || "";

                divItem.innerHTML = `<strong>${cityName}</strong>${countryName ? `, <span class="text-muted">${countryName}</span>` : ""}`;

                divItem.addEventListener("click", () => {
                    input.value = countryName ? `${cityName}, ${countryName}` : cityName;
                    resultsDiv.innerHTML = "";
                    resultsDiv.classList.remove("show");
                });

                resultsDiv.appendChild(divItem);
            });

            resultsDiv.classList.add("show");
        } else {
            resultsDiv.innerHTML = '<div class="p-3 text-muted text-center small">Nenhum resultado encontrado</div>';
            resultsDiv.classList.add("show");
        }
    } catch (error) {
        console.error("Error fetching data:", error);
        resultsDiv.innerHTML = '<div class="p-3 text-danger text-center small">Erro ao carregar resultados</div>';
        resultsDiv.classList.add("show");
    }
}

/* --- 2. Fechar o Dropdown ao clicar fora --- */
document.addEventListener("click", function (e) {
    const resultsDiv  = document.getElementById("results");
    const searchInput = document.getElementById("searchInput");
    if (resultsDiv && searchInput && !searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
        resultsDiv.classList.remove("show");
    }
});

/* --- 3. Lógica de Datas --- */
const todayStr      = new Date().toISOString().split("T")[0];
const departureInput = document.getElementById("departureDate");
const returnInput    = document.getElementById("returnDate");

if (departureInput && returnInput) {
    departureInput.min = todayStr;
    returnInput.min    = todayStr;

    departureInput.addEventListener("change", () => {
        returnInput.min = departureInput.value;
        if (returnInput.value && returnInput.value < departureInput.value) {
            returnInput.value = departureInput.value;
        }
    });
}

/* --- 4. Botão Manual — comportamento original mantido --- */
document.getElementById("manualsearchButton")?.addEventListener("click", () => handleSearch("manualRoteiro"));

function handleSearch(route) {
    const depDate = document.getElementById("departureDate")?.value;
    const retDate = document.getElementById("returnDate")?.value;
    const city    = document.getElementById("searchInput")?.value;

    if (depDate && retDate && city) {
        const queryParams = `?departureDate=${encodeURIComponent(depDate)}&returnDate=${encodeURIComponent(retDate)}&selectedCity=${encodeURIComponent(city)}`;
        window.location.href = `/${route}${queryParams}`;
    } else {
        alert("Por favor, preencha todos os campos antes de continuar.");
    }
}

/* --- 5. Botão Automático --- */

(function () {

    /* -- State -- */
    let currentStep = 0;
    const wizData = {
        destination:   '',
        departureDate: '',
        returnDate:    '',
        styles:        [],
        group:         '',
        budget:        150,
        dayStart:      '09:00',
        dayEnd:        '21:00',
        meals:         'ambos',
        transport:     '',
        extras:        [],
    };
    const groupArr   = [];
    const mealsArr   = [];
    const transportArr = [];

    const stepTitles = [
        ['Nova Viagem',        'Começa a planear a tua próxima aventura'],
        ['Estilo de Viagem',   'Como preferes explorar?'],
        ['Grupo',              'Com quem vais?'],
        ['Orçamento',          'Quanto queres gastar por dia?'],
        ['Horário',            'A que horas começa e termina o teu dia?'],
        ['Refeições',          'Que refeições queres incluir?'],
        ['Deslocação',         'Como preferes mover-te?'],
        ['Extras',             'Alguma preferência especial?'],
        ['A Gerar...',         'O agente IA está a trabalhar para ti'],
    ];

    /* -- Navegação entre steps -- */
    function wizGo(step) {
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));

        const target = document.getElementById('wiz-step-' + step);
        if (!target) return;
        target.classList.add('active');
        currentStep = step;

        const prog = document.getElementById('wizardProgress');
        if (prog) {
            prog.style.display = step === 0 ? 'none' : 'flex';
            prog.querySelectorAll('span').forEach((b, i) => {
                b.classList.toggle('done', i < step - 1);
            });
        }

        const titleEl    = document.getElementById('wizardTitle');
        const subtitleEl = document.getElementById('wizardSubtitle');
        if (titleEl)    titleEl.textContent    = stepTitles[step][0];
        if (subtitleEl) subtitleEl.textContent = stepTitles[step][1];
    }

    window.wizGo   = wizGo;
    window.wizBack = () => wizGo(currentStep - 1);

    /* -- Budget slider -- */
    function wizUpdateBudget(val) {
        wizData.budget = parseInt(val);
        const pct     = ((val - 20) / (500 - 20)) * 100;
        const slider  = document.getElementById('budgetSlider');
        const display = document.getElementById('budgetDisplay');
        if (slider)  slider.style.setProperty('--pct', pct + '%');
        if (display) display.textContent = '€' + val + ' / dia';
    }
    window.wizUpdateBudget = wizUpdateBudget;

    /* -- Opt-cards (multi e single select) -- */
    function initGrid(gridId, arr, nextBtnId, multi = true) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        grid.querySelectorAll('.opt-card').forEach(card => {
            card.addEventListener('click', () => {
                const val = card.dataset.val;
                if (multi) {
                    card.classList.toggle('selected');
                    const idx = arr.indexOf(val);
                    idx === -1 ? arr.push(val) : arr.splice(idx, 1);
                } else {
                    grid.querySelectorAll('.opt-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    arr.length = 0;
                    arr.push(val);
                }
                if (nextBtnId) {
                    const btn = document.getElementById(nextBtnId);
                    if (btn) btn.disabled = arr.length === 0;
                }
            });
        });
    }

    /* -- Gerar roteiro -- */
    async function wizGenerate() {
        wizData.group     = groupArr[0]     || 'sozinho';
        wizData.meals     = mealsArr[0]     || 'ambos';
        wizData.transport = transportArr[0] || 'carro';
        wizData.dayStart  = document.getElementById('dayStartTime')?.value || '09:00';
        wizData.dayEnd    = document.getElementById('dayEndTime')?.value   || '21:00';
        wizGo(8);

        ['gs1', 'gs2', 'gs3', 'gs4', 'gs5'].forEach((id, i) => {
            setTimeout(() => {
                document.getElementById(id)?.classList.add('done');
            }, i * 1800);
        });

        try {
            const res = await fetch('/itinerary/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wizData),
            });
            const data = await res.json();
            if (data.success && data.itineraryId) {
                window.location.href = '/itinerary/' + data.itineraryId;
            } else {
                alert('Erro ao gerar roteiro: ' + (data.error || 'Tenta novamente.'));
                wizGo(4);
            }
        } catch (err) {
            console.error('[Wizard] Erro:', err);
            alert('Erro de ligação. Verifica a tua internet.');
            wizGo(4);
        }
    }
    window.wizGenerate = wizGenerate;

    /* -- Inicialização -- */
    function wizInit() {
        initGrid('styleGrid',    wizData.styles, 'nextStep1', true);
        initGrid('groupGrid',    groupArr,        'nextStep2', false);
        initGrid('mealsGrid',    mealsArr,        'nextStep5', false);
        initGrid('transportGrid',transportArr,   'nextStep6', false);
        initGrid('extrasGrid',   wizData.extras,  null,        true);

        wizUpdateBudget(150);

        const autoBtn = document.getElementById('automaticsearchButton');
        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                const dest = document.getElementById('searchInput')?.value.trim();
                const dep  = document.getElementById('departureDate')?.value;
                const ret  = document.getElementById('returnDate')?.value;

                if (!dest || !dep || !ret) {
                    alert('Por favor preenche o destino e as datas antes de continuar.');
                    return;
                }

                wizData.destination   = dest;
                wizData.departureDate = dep;
                wizData.returnDate    = ret;
                wizGo(1);
            });
        }

        // Reset ao fechar o modal
        const modal = document.getElementById('createItineraryModal');
        if (modal) {
            modal.addEventListener('hidden.bs.modal', () => {
                wizGo(0);
                wizData.styles.length = 0;
                wizData.extras.length = 0;
                groupArr.length = 0;
                document.querySelectorAll('#createItineraryModal .opt-card')
                    .forEach(c => c.classList.remove('selected'));
                const n1 = document.getElementById('nextStep1');
                const n2 = document.getElementById('nextStep2');
                if (n1) n1.disabled = true;
                if (n2) n2.disabled = true;
                wizUpdateBudget(150);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wizInit);
    } else {
        wizInit();
    }

})();