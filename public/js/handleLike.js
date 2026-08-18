// Função principal para processar o Like
async function handleLike(button) {
    const postId = button.getAttribute('data-post-id');
    const icon = button.querySelector('i');
    
    // 1. Subimos até ao cartão principal e descemos até ao contador
    const card = button.closest('.feed-card');
    const countDiv = card.querySelector('.feed-content .fw-bold');

    if (button.classList.contains('loading')) return;
    button.classList.add('loading');

    try {
        const response = await fetch(`/dashboard/${postId}/like`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.status === 401) {
            window.location.href = '/users/login'; 
            return;
        }

        const data = await response.json();

        if (response.ok) {
            let currentCount = parseInt(countDiv.innerText) || 0;
            
            if (data.liked) {
                icon.classList.replace('fa-regular', 'fa-solid');
                icon.classList.add('text-danger');
                countDiv.innerText = `${currentCount + 1} gostos`;
            } else {
                icon.classList.replace('fa-solid', 'fa-regular');
                icon.classList.remove('text-danger');
                countDiv.innerText = `${Math.max(0, currentCount - 1)} gostos`;
            }
        }
    } catch (err) {
        console.error("Erro ao dar like:", err);
    } finally {
        button.classList.remove('loading');
    }
}

// 2. OUVINTE DE EVENTOS (A parte que resolve o erro do Helmet)
// Espera o DOM carregar e anexa o clique aos botões
document.addEventListener('DOMContentLoaded', () => {
    // Escuta cliques em qualquer lugar do documento
    document.addEventListener('click', async (event) => {
        // Verifica se o que foi clicado é o botão de like ou o ícone dentro dele
        const button = event.target.closest('.like-btn');
        
        if (button) {
            event.preventDefault(); // Evita comportamento de link
            await handleLike(button); // Chama a sua função que já corrigimos
        }
    });
});