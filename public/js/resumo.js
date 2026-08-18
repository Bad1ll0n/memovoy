document.addEventListener("DOMContentLoaded", () => {
    // 1. Limpa o container visual antes de começar
    const resumoContainer = document.getElementById("resumo-container");
    resumoContainer.innerHTML = "";

    const data = localStorage.getItem("selectedEvents");
    if (!data) {
        resumoContainer.innerHTML = `<div class="alert alert-warning text-center">Nenhum roteiro encontrado. Volte e selecione seus locais.</div>`;
        return;
    }

    const calendarData = JSON.parse(data);

    if (Object.keys(calendarData).length === 0) {
        resumoContainer.innerHTML = `<p class="text-center text-muted">Nenhum local selecionado ainda.</p>`;
        return;
    }

    Object.keys(calendarData).sort().forEach(date => {
        const eventos = calendarData[date];
        if (eventos.length === 0) return;

        // Criar seção de data (Card)
        const dateSection = document.createElement("div");
        dateSection.className = "card shadow-sm mb-4 border-0";

        // Formatação da data para o título
        const [year, month, day] = date.split('-');
        const dateFormatted = `${day}/${month}/${year}`;

        let htmlContent = `
            <div class="card-header bg-light border-0">
                <h5 class="mb-0 pt-2"><i class="bi bi-calendar3"></i> 📅 ${dateFormatted}</h5>
            </div>
            <ul class="list-group list-group-flush">
        `;

        // Ordenar eventos pela hora
        eventos.sort((a, b) => a.time.localeCompare(b.time));

        eventos.forEach(event => {
            htmlContent += `
                <li class="list-group-item p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <span class="badge bg-primary me-2">${event.time}</span>
                            <span class="fw-bold text-dark">${event.name}</span>
                        </div>
                    </div>
                    <div class="mt-2 text-muted small">
                        <i class="bi bi-geo-alt"></i> 
                        <span class="text-secondary">Lat: ${event.lat} | Lng: ${event.lng}</span>
                    </div>
                </li>
            `;
        });

        htmlContent += `</ul>`;
        dateSection.innerHTML = htmlContent;
        resumoContainer.appendChild(dateSection);
    });
});