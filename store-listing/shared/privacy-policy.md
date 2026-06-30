# Política de Privacidade — MemoVoy

**Última actualização: [DATA A PREENCHER]**

Esta Política de Privacidade descreve como o MemoVoy ("nós", "a app")
recolhe, usa, armazena e protege os dados pessoais dos utilizadores
("tu", "o utilizador") ao usar a aplicação móvel e o website MemoVoy.

> ⚠️ **Nota de implementação**: este documento é um rascunho técnico
> preparado para revisão jurídica antes de publicação. Não substitui
> aconselhamento legal. Antes de publicar nas lojas de aplicações, este
> texto deve ser revisto por um advogado especializado em RGPD (Portugal/UE)
> e LGPD (Brasil), e o link final deve ser colocado tanto no App Store
> Connect como no Google Play Console, secção de Política de Privacidade.

---

## 1. Quem somos

O MemoVoy é operado por **[NOME DA EMPRESA/ENTIDADE A PREENCHER]**,
com sede em **[MORADA A PREENCHER]**, número de identificação fiscal
**[NIF/CNPJ A PREENCHER]**.

Contacto para questões de privacidade: privacidade@memovoy.com

---

## 2. Que dados recolhemos

### 2.1 Dados fornecidos directamente por ti

| Dado | Quando é recolhido | Finalidade |
|---|---|---|
| Email | Registo de conta | Autenticação, comunicações de conta |
| Nome de utilizador, nome de exibição | Registo de conta | Identificação pública na app |
| Password | Registo de conta | Autenticação (nunca armazenada em texto simples — usamos argon2id) |
| Fotografia de perfil | Opcional, perfil | Personalização do perfil |
| Biografia, localização de texto | Opcional, perfil | Personalização do perfil |
| Fotos e vídeos de publicações | Ao publicar | Conteúdo da rede social |
| Comentários, mensagens | Ao interagir | Funcionalidade social |
| Dados de roteiros (destino, datas, actividades) | Ao criar roteiros | Funcionalidade principal da app |
| Dados de despesas | Opcional, expense tracker | Funcionalidade de controlo de gastos |

### 2.2 Dados recolhidos automaticamente

| Dado | Finalidade |
|---|---|
| Endereço IP | Segurança, prevenção de fraude |
| Tipo de dispositivo, sistema operativo | Compatibilidade, suporte técnico |
| Identificador de push notifications (token FCM/APNs) | Envio de notificações |
| Localização aproximada (se autorizada) | Notificações geo-relacionadas, sugestões de destino |
| Dados de utilização (ecrãs visitados, interacções) | Melhoria do produto, analytics |

### 2.3 Dados que NÃO recolhemos

Não recolhemos dados biométricos, dados de saúde, dados financeiros
sensíveis (números de cartão de crédito — pagamentos futuros serão
geridos por processadores terceiros certificados), nem dados de
localização precisa em contínuo (apenas localização aproximada, e
apenas com autorização explícita).

---

## 3. Como usamos os teus dados

Usamos os teus dados pessoais para:

1. **Fornecer o serviço** — criar e gerir a tua conta, publicar conteúdo, gerar roteiros com IA, calcular gamificação e pegada de carbono
2. **Comunicar contigo** — notificações push sobre actividade na app (likes, comentários, badges), emails transaccionais (confirmação de registo, recuperação de password)
3. **Segurança** — detectar e prevenir actividade fraudulenta, abuso, ou violação dos termos de serviço
4. **Melhorar o produto** — análise agregada e anonimizada de uso para decisões de produto
5. **Cumprir obrigações legais** — quando exigido por lei

### 3.1 Geração de roteiros com Inteligência Artificial

Quando usas o assistente de IA (wizard) para criar um roteiro, o texto
do teu pedido (destino, datas, preferências) é enviado à API da
Anthropic (Claude) para gerar sugestões. Este envio:

- Não inclui o teu nome, email, ou outros identificadores diretos
- É processado de acordo com a política de privacidade e retenção de
  dados da Anthropic, disponível em https://anthropic.com/privacy
- Não é usado pela Anthropic para treinar os seus modelos (de acordo
  com os termos comerciais da API)

---

## 4. Com quem partilhamos os teus dados

### 4.1 Visibilidade dentro da app

Conteúdo que marcas como **público** é visível a qualquer utilizador
da app, incluindo não-autenticados (no feed de descoberta). Conteúdo
marcado como **apenas seguidores** é visível só a quem te segue.
Conteúdo **privado** é visível só a ti.

### 4.2 Prestadores de serviço (subprocessadores)

| Serviço | Finalidade | Dados partilhados |
|---|---|---|
| Anthropic (Claude API) | Geração de roteiros e listas de bagagem por IA | Texto do prompt, sem PII directa |
| Firebase Cloud Messaging | Push notifications Android | Token do dispositivo |
| Apple Push Notification Service | Push notifications iOS | Token do dispositivo |
| [Provedor de armazenamento de imagens — A PREENCHER] | Armazenamento de fotos/vídeos publicados | Ficheiros de media |
| [Provedor de hosting/cloud — A PREENCHER] | Infraestrutura da aplicação | Todos os dados, encriptados |

Não vendemos os teus dados pessoais a terceiros, nem os partilhamos
para fins de publicidade direccionada — o MemoVoy não exibe anúncios.

### 4.3 Divulgação legal

Podemos divulgar dados quando exigido por lei, ordem judicial, ou para
proteger os direitos, propriedade ou segurança do MemoVoy, dos nossos
utilizadores, ou do público.

---

## 5. Os teus direitos

### 5.1 Se estás na União Europeia (incluindo Portugal) — RGPD

Tens o direito de:
- **Aceder** aos dados pessoais que temos sobre ti
- **Rectificar** dados incorrectos ou incompletos
- **Apagar** os teus dados ("direito ao esquecimento")
- **Limitar o processamento** dos teus dados em certas circunstâncias
- **Portabilidade** — receber os teus dados num formato estruturado
- **Opor-te** ao processamento baseado em interesse legítimo
- **Apresentar reclamação** junto da Comissão Nacional de Protecção de Dados (CNPD)

### 5.2 Se estás no Brasil — LGPD

Tens o direito de:
- **Confirmar a existência** de tratamento de dados
- **Aceder** aos teus dados
- **Corrigir** dados incompletos, inexactos ou desactualizados
- **Anonimizar, bloquear ou eliminar** dados desnecessários ou excessivos
- **Portabilidade** dos dados a outro fornecedor de serviço
- **Eliminação** dos dados tratados com consentimento
- **Revogar o consentimento** a qualquer momento
- **Apresentar reclamação** junto da Autoridade Nacional de Protecção de Dados (ANPD)

### 5.3 Como exercer os teus direitos

Podes exercer estes direitos directamente na app, em Definições →
Privacidade → Os meus dados, ou contactando-nos em
privacidade@memovoy.com. Respondemos a pedidos no prazo legal aplicável
(geralmente 30 dias).

A eliminação de conta remove permanentemente o teu perfil, publicações
privadas e dados pessoais. Conteúdo público que tenha sido partilhado
ou comentado por outros pode ser parcialmente preservado de forma
anonimizada, conforme necessário para a integridade da plataforma.

---

## 6. Retenção de dados

Mantemos os teus dados enquanto a tua conta estiver activa. Após
eliminação de conta:

| Categoria | Prazo de retenção pós-eliminação |
|---|---|
| Dados de identificação directa (email, nome) | Eliminados imediatamente |
| Conteúdo de publicações | Eliminado imediatamente (soft-delete imediato, hard-delete em 30 dias) |
| Logs de segurança e auditoria | 7 anos (obrigação legal) |
| Dados financeiros (despesas registadas) | Eliminados imediatamente |

---

## 7. Segurança

Implementamos medidas técnicas e organizacionais para proteger os teus
dados:

- Passwords nunca armazenadas em texto simples (hash argon2id)
- Email pessoal encriptado em repouso na base de dados
- Comunicação entre a app e os nossos servidores sempre via TLS (HTTPS)
- Certificate pinning nas apps móveis para prevenir ataques man-in-the-middle
- Row-Level Security (RLS) na base de dados, garantindo que cada
  utilizador só acede aos dados que lhe pertencem ou que foram
  explicitamente partilhados
- Moderação de conteúdo para detectar e remover material inadequado

Apesar destas medidas, nenhum sistema é 100% seguro. Encorajamos-te a
usar uma password forte e única para a tua conta MemoVoy.

---

## 8. Menores de idade

O MemoVoy não é direccionado a crianças menores de 16 anos (ou a idade
mínima aplicável na tua jurisdição). Não recolhemos intencionalmente
dados de menores abaixo desta idade. Se tomarmos conhecimento de que
recolhemos dados de um menor sem consentimento parental verificável,
eliminaremos esses dados.

---

## 9. Transferências internacionais de dados

Os dados de utilizadores portugueses são armazenados em infraestrutura
localizada na União Europeia (região `eu-central-1`). Os dados de
utilizadores brasileiros são armazenados em infraestrutura localizada
na América do Sul (região `sa-east-1`), conforme a residência de dados
escolhida no registo. Quando uma transferência internacional for
necessária (por exemplo, para processamento via Anthropic API),
garantimos que existem salvaguardas adequadas (cláusulas contratuais
padrão ou mecanismo equivalente).

---

## 10. Alterações a esta política

Podemos actualizar esta Política de Privacidade periodicamente.
Notificaremos sobre alterações materiais através da app ou por email,
com pelo menos 14 dias de antecedência da entrada em vigor.

---

## 11. Contacto

Para questões relacionadas com privacidade e protecção de dados:

**Email**: privacidade@memovoy.com
**Encarregado de Protecção de Dados (DPO)**: [A PREENCHER, se aplicável]
**Morada**: [A PREENCHER]

---

*Este documento foi preparado como rascunho técnico de base. Requer
revisão por advogado especializado em RGPD/LGPD antes de publicação
oficial e submissão às lojas de aplicações.*
