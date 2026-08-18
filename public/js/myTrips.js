const gUser = 'bf0bcc35-15e7-43d8-aa13-aeec66b403b5';

// Função auxiliar para criar ícones SVG (Play, Edit, Trash)
const getIcon = (type) => {
    const icons = {
        play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
        view: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm3 3l6 3-6 3V9z"/></svg>', // Simulação do botão quadrado com play
        edit: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
        trash: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>'
    };
    return icons[type] || '';
};

fetch(`/myTrips?g_user=${encodeURIComponent(gUser)}`)
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('myTrips');

        if (!container) {
            console.error('Elemento #myTrips não encontrado');
            return;
        }

        container.innerHTML = '';

        data.forEach(item => {
            if (!item.T_CONTEUDO || !item.T_NOME) return;

            // 1. Parse do Conteúdo
            let conteudo = {};
            try {
                conteudo = typeof item.T_CONTEUDO === 'string'
                    ? JSON.parse(item.T_CONTEUDO)
                    : item.T_CONTEUDO;
            } catch (e) {
                console.error("Erro ao ler JSON do roteiro", item.T_NOME);
                return;
            }

            // 2. Calcular número de paragens (Total de itens em todos os dias)
            let totalParagens = 0;
            if (conteudo) {
                Object.values(conteudo).forEach(listaLocais => {
                    if (Array.isArray(listaLocais)) {
                        totalParagens += listaLocais.length;
                    }
                });
            }

            // 3. Formatar Data (Simulada, pois o snippet original não tinha o campo data)
            // Se o objeto item tiver um campo de data (ex: item.DT_CRIACAO), use-o.
            // Aqui vou usar uma data fixa ou data atual para exemplo.
            const dataCriacao = item.DT_CRIACAO
                ? new Date(item.DT_CRIACAO).toLocaleDateString('pt-PT')
                : new Date().toLocaleDateString('pt-PT');

            // --- CRIAR ELEMENTOS DOM ---

            const card = document.createElement('div');
            card.className = 'trip-card';

            // Lado Esquerdo: Título e Meta dados
            const infoDiv = document.createElement('div');
            infoDiv.className = 'trip-info';

            const title = document.createElement('h3');
            title.textContent = item.T_NOME;

            const meta = document.createElement('p');
            meta.className = 'trip-meta';
            meta.textContent = `Criado em ${dataCriacao} • ${totalParagens} paragens`;

            infoDiv.appendChild(title);
            infoDiv.appendChild(meta);

            // Lado Direito: Botões de Ação
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'trip-actions';

            // Botão Play (Preenchido)
            const btnPlay = document.createElement('button');
            btnPlay.className = 'action-btn';
            btnPlay.innerHTML = getIcon('play');
            btnPlay.title = "Iniciar Roteiro";

            // Botão View (Quadrado)
            const btnView = document.createElement('button');
            btnView.className = 'action-btn';
            btnView.innerHTML = getIcon('view');
            btnView.title = "Ver Detalhes";

            // Botão Edit
            const btnEdit = document.createElement('button');
            btnEdit.className = 'action-btn';
            btnEdit.innerHTML = getIcon('edit');
            btnEdit.title = "Editar";

            // Botão Delete
            const btnDelete = document.createElement('button');
            btnDelete.className = 'action-btn';
            btnDelete.innerHTML = getIcon('trash');
            btnDelete.title = "Apagar";

            // Adicionar evento de delete (exemplo)
            btnDelete.onclick = async () => {
                // Agora capturamos o ID de forma direta
                const roteiroId = item.id;

                if (!roteiroId) {
                    console.error("Propriedades disponíveis no item:", Object.keys(item));
                    alert("Erro: Não foi possível localizar o ID deste roteiro.");
                    return;
                }

                if (confirm(`Deseja eliminar definitivamente "${item.T_NOME}"?`)) {
                    try {
                        const response = await fetch(`/delete-roteiro?roteiroId=${roteiroId}&g_user=${encodeURIComponent(gUser)}`, {
                            method: 'DELETE'
                        });

                        // Lemos a resposta como texto para ver as mensagens de sucesso/erro do servidor
                        const textoResposta = await response.text();

                        if (response.ok) {
                            // Remove o elemento visualmente apenas se foi apagado na BD
                            card.remove();
                            console.log("Sucesso:", textoResposta);
                        } else {
                            alert("Erro do servidor: " + textoResposta);
                        }
                    } catch (err) {
                        console.error('Erro na ligação ao servidor:', err);
                        alert("Não foi possível conectar ao servidor.");
                    }
                }
            };

            actionsDiv.appendChild(btnPlay);
            actionsDiv.appendChild(btnView);
            actionsDiv.appendChild(btnEdit);
            actionsDiv.appendChild(btnDelete);

            // Montar o Card
            card.appendChild(infoDiv);
            card.appendChild(actionsDiv);

            container.appendChild(card);
        });
    })
    .catch(err => console.error('Erro ao carregar dados:', err));