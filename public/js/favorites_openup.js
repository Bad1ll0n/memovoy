// Função para abrir o modal e preencher os dados
function openModal(element) {
    // Captura os dados dos atributos data-
    const img = element.getAttribute('data-img');
    const avatar = element.getAttribute('data-avatar');
    const name = element.getAttribute('data-name');
    const location = element.getAttribute('data-location');
    const caption = element.getAttribute('data-caption');
    const time = element.getAttribute('data-time');

    // Injeta nos elementos do Modal
    document.getElementById('mImage').src = img;
    document.getElementById('mAvatar').src = avatar;
    document.getElementById('mName').textContent = name;
    document.getElementById('mNameCaption').textContent = name;
    document.getElementById('mLocation').textContent = location;
    document.getElementById('mCaption').textContent = caption;
    
    // Atualiza o tempo com o valor que veio do Controller
    const timeElement = document.getElementById('mTime');
    if (timeElement) {
        timeElement.textContent = time;
    }

    // Abre o modal (exemplo se usares uma classe 'active')
    document.getElementById('postModalOverlay').classList.add('active');
}

// Função para fechar o modal
function closeModal() {
    document.getElementById('postModalOverlay').classList.remove('active');
    document.body.style.overflow = 'auto'; // Reativa o scroll
}

// Fechar se clicar fora do conteúdo (no fundo escuro)
document.getElementById('postModalOverlay').addEventListener('click', function (e) {
    if (e.target === this) {
        closeModal();
    }
});

// Fechar com a tecla ESC
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});

