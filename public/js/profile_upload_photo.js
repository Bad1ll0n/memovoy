document.addEventListener('DOMContentLoaded', () => {
    console.log("Script iniciado...");

    const btnCover = document.getElementById('btn-trigger-cover');
    const inputCover = document.getElementById('input-cover');
    const previewCover = document.getElementById('preview-cover');

    const btnAvatar = document.getElementById('btn-trigger-avatar');
    const inputAvatar = document.getElementById('input-avatar');
    const previewAvatar = document.getElementById('preview-avatar');

    // --- Lógica da CAPA ---
    if (btnCover && inputCover) {
        btnCover.addEventListener('click', (e) => {
            console.log("Botão da capa clicado!"); // Se isto não aparecer no F12, o CSS está a bloquear o botão
            e.preventDefault();
            inputCover.click();
        });

        inputCover.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewCover.src = e.target.result;
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    } else {
        console.error("Erro: Elementos da capa não encontrados!");
    }

    // --- Lógica do AVATAR ---
    if (btnAvatar && inputAvatar) {
        btnAvatar.addEventListener('click', (e) => {
            console.log("Botão do avatar clicado!");
            e.preventDefault();
            inputAvatar.click();
        });

        inputAvatar.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewAvatar.src = e.target.result;
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    }
});