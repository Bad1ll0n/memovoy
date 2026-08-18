async function handleComment(postId, btn) {
    // Apanhar o input que está ao lado do botão
    const inputField = document.getElementById(`input-${postId}`);
    const commentText = inputField.value;
    const countSpan = document.getElementById(`count-comment-${postId}`);

    if (!commentText.trim()) return; // Não envia se estiver vazio

    // Desativa botão para não clicar 2 vezes
    btn.disabled = true;

    try {
        // Nota: O URL inclui '/dashboard' por causa da configuração no server.js
        const response = await fetch(`/dashboard/${postId}/comment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' // Importante para enviar texto
            },
            body: JSON.stringify({ commentText }) // Envia o texto no corpo
        });

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        const data = await response.json();

        if (response.ok && data.success) {

            const commentsList = document.getElementById(`comments-list-${postId}`);

            // Criar o novo elemento de comentário visualmente
            const newComment = document.createElement('div');
            newComment.className = 'small mb-2 d-flex align-items-center gap-2';
            newComment.style.color = 'var(--text-muted, #888)';
            const avatar = window._currentUserAvatar || '/assets/images/default-avatar.jpg';
            newComment.innerHTML = `
                <img src="${avatar}" class="rounded-circle" style="width:22px;height:22px;object-fit:cover;flex-shrink:0;" onerror="this.src='/assets/images/default-avatar.jpg'">
                <span><span class="fw-bold" style="color:var(--text-primary,var(--text));">Tu</span> ${commentText}</span>
            `;

            // Adicionar à lista (e manter apenas os mais recentes se quiseres)
            commentsList.appendChild(newComment);
            
            inputField.value = '';

            // 2. Atualiza o número de comentários visualmente (+1)
            let currentCount = parseInt(countSpan.innerText) || 0;
            countSpan.innerText = currentCount + 1;
        } else {
            alert("Erro ao comentar.");
        }

    } catch (err) {
        console.error("Erro no comentário:", err);
    } finally {
        btn.disabled = false;
    }
}

// Se estiveres num ficheiro separado, garante que está global:
window.handleComment = handleComment;