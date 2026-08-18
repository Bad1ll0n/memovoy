document.getElementById("btnSalvar").addEventListener("click", async () => {
    const locaisData = localStorage.getItem("selectedEvents");

    if (!locaisData) {
        Swal.fire("Ops!", "Nenhum local para salvar.", "warning");
        return;
    }

    const { value: nomeRoteiro } = await Swal.fire({
        title: 'Nome do seu roteiro',
        input: 'text',
        inputPlaceholder: 'Ex: Minha Viagem Especial',
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (!value) return 'O nome é obrigatório!';
        }
    });

    if (nomeRoteiro) {
        const payload = {
            nome: nomeRoteiro,
            conteudo: JSON.parse(locaisData)
        };

        fetch("http://localhost:3000/saveRoteiros", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (!res.ok) throw new Error("Erro ao salvar");
            return res.json();
        })
        .then(data => {
            // Limpa o armazenamento local
            localStorage.removeItem("selectedEvents");

            // Feedback visual com fechamento automático
            Swal.fire({
                title: "Salvo com sucesso!",
                text: "Redirecionando para suas viagens...",
                icon: "success",
                timer: 2000, // 2 segundos
                timerProgressBar: true,
                showConfirmButton: false, // Remove o botão para não precisar clicar
                willClose: () => {
                    // Redireciona quando o timer acabar
                    window.location.href = "/profile_trips";
                }
            });
        })
        .catch(err => {
            Swal.fire("Erro", "Não foi possível salvar o roteiro.", "error");
            console.error(err);
        });
    }
});