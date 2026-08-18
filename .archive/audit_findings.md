AUDITORIA TÉCNICA - PROBLEMAS ENCONTRADOS

## CRÍTICOS (quebram funcionalidade ou segurança)

1. TABELA AUSENTE: comments
   - Social domain lista "comments" mas a tabela nunca foi definida
   - Sem ela: comentários em posts impossíveis

2. TABELA AUSENTE: user_badges / notifications / audit_logs / feature_flags
   - Sistema domain lista estas tabelas, nenhuma foi definida
   - user_badges referenciada em challenges.badge_id como FK mas não existe
   - notifications: sistema de push/email/geo não tem tabela
   - audit_logs: obrigatório para RGPD compliance
   - feature_flags: definidos no roadmap mas sem tabela

3. TABELA AUSENTE: leaderboard_entries
   - Gamification domain lista mas nunca definida

4. TABELA AUSENTE: user_devices  
   - Users domain lista "user_devices" (necessário para push notifications e anomaly detection por device)

5. CONSTRAINT AUSENTE: follows auto-follow
   - follows não tem CHECK(follower_id != following_id)
   - Utilizador pode seguir-se a si próprio

6. CONSTRAINT AUSENTE: itinerary_days UNIQUE
   - (itinerary_id, day_number) deveria ser UNIQUE mas não está definido como constraint explícito na tabela
   - Apenas mencionado na nota, não na definição

7. CONSTRAINT AUSENTE: reports UNIQUE
   - (reporter_id, target_id, target_type) deveria ser UNIQUE
   - Mencionado na nota mas não definido como constraint

8. ÍNDICE PROBLEMÁTICO: idx_feed_interactions_user_recent
   - WHERE created_at > NOW() - INTERVAL '90 days' é um índice parcial com condição dinâmica
   - PostgreSQL não suporta isto — a condição no WHERE de um índice tem de ser imutável
   - Este índice NÃO VAI FUNCIONAR — vai dar erro no CREATE INDEX

9. ÍNDICE AUSENTE: follows inverso
   - Existe idx_follows_following(following_id, follower_id)
   - Mas falta idx_follows_follower(follower_id, following_id)
   - Sem ele, "listar quem eu sigo" é um seq scan

10. ÍNDICE AUSENTE: posts por país
    - top países do mês usa posts.country_code mas não há índice

11. ÍNDICE AUSENTE: itinerary_activities por day_id
    - Buscar todas as atividades de um dia requer seq scan sem este índice

12. TRIGGER INCOMPLETO: contadores desnormalizados
    - Só o trigger de likes_count está implementado
    - follows → follower_count, saves → saves_count, posts → total_trips
    - Estão mencionados como "trigger semelhante" mas não implementados
    - Em produção, os contadores ficariam sempre a 0

13. PROBLEMA DE CONCORRÊNCIA: contador com race condition
    - UPDATE posts SET likes_count = likes_count + 1 pode ter race condition
    - Correto mas precisa de SELECT FOR UPDATE ou usar pg_advisory_lock

14. COLUNA AUSENTE: comments precisa de parent_comment_id para respostas a comentários

15. VALIDAÇÃO AUSENTE: prompt_versions traffic_percentage
    - Não há CHECK constraint a garantir que a soma de traffic_percentage = 100
    - Em produção pode facilmente somar 120% ou 80%

