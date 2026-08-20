import { z } from 'zod'
import { query } from '../db/pool.js'
import { limparCampos } from '../services/sanitize.js'
import { notifyUser } from '../services/notifyUser.js'

function groupDto(row, viewerId) {
  return {
    id:          row.id,
    name:        row.name,
    description: row.description,
    destination: row.destination,
    isPrivate:   row.is_private,
    coverUrl:    row.cover_url,
    membersCount: Number(row.members_count ?? 0),
    postsCount:   Number(row.posts_count ?? 0),
    createdAt:   row.created_at,
    owner: {
      id:          row.owner_id,
      username:    row.owner_username,
      displayName: row.owner_display_name ?? row.owner_username,
      avatarUrl:   row.owner_avatar_url,
    },
    viewerIsMember: row.viewer_is_member ?? false,
    viewerIsOwner:  viewerId === row.owner_id,
  }
}

export async function groupsRoutes(app) {
  // POST /groups — create a group (auto-joins owner)
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      name:        z.string().min(2).max(80),
      description: z.string().max(500).optional(),
      destination: z.string().max(100).optional(),
      isPrivate:   z.boolean().default(false),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { name, description, destination, isPrivate } =
      limparCampos(parsed.data, ['name', 'description', 'destination'])
    const { rows } = await query(
      `INSERT INTO travel_groups (owner_id, name, description, destination, is_private)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [request.user.id, name, description ?? null, destination ?? null, isPrivate],
    )
    const groupId = rows[0].id
    // Auto-join owner
    await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupId, request.user.id])
    return reply.status(201).send({ id: groupId })
  })

  // GET /groups — list public groups + groups the user belongs to
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const viewerId = request.user.id
    const search   = request.query.q?.trim() ?? ''
    const limit    = 24

    const { rows } = await query(
      `SELECT g.*,
        u.username AS owner_username, u.display_name AS owner_display_name, u.avatar_url AS owner_avatar_url,
        COUNT(DISTINCT gm.user_id) AS members_count,
        COUNT(DISTINCT p.id)       AS posts_count,
        EXISTS(SELECT 1 FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.user_id = $1) AS viewer_is_member
       FROM travel_groups g
       JOIN users u ON u.id = g.owner_id
       LEFT JOIN group_members gm ON gm.group_id = g.id
       LEFT JOIN posts p ON p.group_id = g.id
       WHERE (g.is_private = FALSE OR EXISTS(SELECT 1 FROM group_members gm3 WHERE gm3.group_id = g.id AND gm3.user_id = $1))
         AND ($2 = '' OR g.name ILIKE '%' || $2 || '%' OR g.destination ILIKE '%' || $2 || '%')
       GROUP BY g.id, u.id
       ORDER BY viewer_is_member DESC, members_count DESC
       LIMIT $3`,
      [viewerId, search, limit],
    )
    return reply.send({ groups: rows.map((r) => groupDto(r, viewerId)) })
  })

  // GET /groups/:id — group detail
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const viewerId = request.user.id
    const { rows } = await query(
      `SELECT g.*,
        u.username AS owner_username, u.display_name AS owner_display_name, u.avatar_url AS owner_avatar_url,
        COUNT(DISTINCT gm.user_id) AS members_count,
        COUNT(DISTINCT p.id)       AS posts_count,
        EXISTS(SELECT 1 FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.user_id = $2) AS viewer_is_member
       FROM travel_groups g
       JOIN users u ON u.id = g.owner_id
       LEFT JOIN group_members gm ON gm.group_id = g.id
       LEFT JOIN posts p ON p.group_id = g.id
       WHERE g.id = $1
       GROUP BY g.id, u.id`,
      [request.params.id, viewerId],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Grupo não encontrado.' })

    const group = groupDto(rows[0], viewerId)

    if (rows[0].is_private && !group.viewerIsMember) {
      return reply.status(403).send({ message: 'Grupo privado.' })
    }

    // Recent members
    const { rows: memberRows } = await query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM group_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at DESC LIMIT 12`,
      [request.params.id],
    )

    return reply.send({ ...group, recentMembers: memberRows.map((m) => ({
      id: m.id, username: m.username, displayName: m.display_name ?? m.username, avatarUrl: m.avatar_url,
    })) })
  })

  // PATCH /groups/:id — update group (owner only)
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      name:        z.string().min(2).max(80).optional(),
      description: z.string().max(500).optional().nullable(),
      destination: z.string().max(100).optional().nullable(),
      isPrivate:   z.boolean().optional(),
      coverUrl:    z.string().url().max(500).optional().nullable(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows: own } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [request.params.id])
    if (own.length === 0) return reply.status(404).send({ message: 'Grupo não encontrado.' })
    if (own[0].owner_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const updates = []; const values = [request.params.id]; let idx = 2
    if (parsed.data.name        !== undefined) { updates.push(`name = $${idx++}`);        values.push(parsed.data.name) }
    if (parsed.data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(parsed.data.description) }
    if (parsed.data.destination !== undefined) { updates.push(`destination = $${idx++}`); values.push(parsed.data.destination) }
    if (parsed.data.isPrivate   !== undefined) { updates.push(`is_private = $${idx++}`);  values.push(parsed.data.isPrivate) }
    if (parsed.data.coverUrl    !== undefined) { updates.push(`cover_url = $${idx++}`);   values.push(parsed.data.coverUrl) }
    if (updates.length === 0) return reply.send({ ok: true })

    await query(`UPDATE travel_groups SET ${updates.join(', ')} WHERE id = $1`, values)
    return reply.send({ ok: true })
  })

  // POST /groups/:id/join
  app.post('/:id/join', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT owner_id, is_private FROM travel_groups WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Grupo não encontrado.' })
    if (rows[0].is_private) return reply.status(403).send({ message: 'Grupo privado — precisa de convite.' })

    await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [request.params.id, request.user.id])

    // Notify owner
    const ownerId = rows[0].owner_id
    if (ownerId !== request.user.id) {
      notifyUser({
        recipientId: ownerId,
        actorId:     request.user.id,
        type:        'follow',
        message:     `${request.user.username} entrou no teu grupo.`,
        targetUrl:   `/groups/${request.params.id}`,
      }).catch(() => {})
    }

    return reply.status(201).send({ ok: true })
  })

  // DELETE /groups/:id/leave
  app.delete('/:id/leave', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Grupo não encontrado.' })
    if (rows[0].owner_id === request.user.id) {
      return reply.status(400).send({ message: 'O dono não pode sair. Elimina o grupo ou transfere a propriedade.' })
    }
    await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [request.params.id, request.user.id])
    return reply.send({ ok: true })
  })

  // PATCH /groups/:id/transfer — transfer ownership to another member (owner only)
  app.patch('/:id/transfer', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({ userId: z.string().uuid() })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: 'userId inválido.' })

    const { rows } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Grupo não encontrado.' })
    if (rows[0].owner_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })
    if (parsed.data.userId === request.user.id) return reply.status(400).send({ message: 'Já és o dono.' })

    // Target must be a member
    const { rows: memberCheck } = await query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [request.params.id, parsed.data.userId],
    )
    if (memberCheck.length === 0) return reply.status(400).send({ message: 'O utilizador não é membro do grupo.' })

    await query('UPDATE travel_groups SET owner_id = $1 WHERE id = $2', [parsed.data.userId, request.params.id])
    return reply.send({ ok: true })
  })

  // POST /groups/:id/invite — invite a user to a private group (owner or member)
  app.post('/:id/invite', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({ userId: z.string().uuid() })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: 'userId inválido.' })

    const groupId = request.params.id
    const inviterId = request.user.id
    const inviteeId = parsed.data.userId

    // Inviter must be a member
    const { rows: memberCheck } = await query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, inviterId],
    )
    if (memberCheck.length === 0) return reply.status(403).send({ message: 'Não és membro deste grupo.' })

    // Invitee must not already be a member
    const { rows: alreadyMember } = await query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, inviteeId],
    )
    if (alreadyMember.length > 0) return reply.status(400).send({ message: 'Utilizador já é membro.' })

    const { rows: invite } = await query(
      `INSERT INTO group_invites (group_id, inviter_id, invitee_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, invitee_id) DO UPDATE
         SET status = 'pending', expires_at = NOW() + INTERVAL '7 days'
       RETURNING token`,
      [groupId, inviterId, inviteeId],
    )

    notifyUser({
      recipientId: inviteeId,
      actorId:     inviterId,
      type:        'follow',
      message:     `${request.user.username} convidou-te para um grupo.`,
      targetUrl:   `/groups/${groupId}`,
    }).catch(() => {})

    return reply.status(201).send({ token: invite[0].token })
  })

  // GET /groups/:id/invites — list pending invites for this group (owner only)
  app.get('/:id/invites', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows: own } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [request.params.id])
    if (own.length === 0) return reply.status(404).send({ message: 'Grupo não encontrado.' })
    if (own[0].owner_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const { rows } = await query(
      `SELECT gi.id, gi.token, gi.status, gi.expires_at, gi.created_at,
              u.id AS invitee_id, u.username AS invitee_username, u.avatar_url AS invitee_avatar,
              inv.username AS inviter_username
       FROM group_invites gi
       JOIN users u   ON u.id = gi.invitee_id
       JOIN users inv ON inv.id = gi.inviter_id
       WHERE gi.group_id = $1 AND gi.status = 'pending' AND gi.expires_at > NOW()
       ORDER BY gi.created_at DESC`,
      [request.params.id],
    )

    return reply.send({ invites: rows.map((r) => ({
      id:         r.id,
      token:      r.token,
      status:     r.status,
      expiresAt:  r.expires_at,
      createdAt:  r.created_at,
      invitee: { id: r.invitee_id, username: r.invitee_username, avatarUrl: r.invitee_avatar },
      inviterUsername: r.inviter_username,
    })) })
  })

  // POST /groups/:id/join/:token — accept an invite and join the group
  app.post('/:id/join/:token', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows: invite } = await query(
      `SELECT invitee_id FROM group_invites
       WHERE token = $1 AND group_id = $2 AND status = 'pending' AND expires_at > NOW()`,
      [request.params.token, request.params.id],
    )
    if (invite.length === 0) return reply.status(404).send({ message: 'Convite inválido ou expirado.' })
    if (invite[0].invitee_id !== request.user.id) return reply.status(403).send({ message: 'Este convite não é para ti.' })

    await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [request.params.id, request.user.id])
    await query("UPDATE group_invites SET status = 'accepted' WHERE token = $1", [request.params.token])

    return reply.status(201).send({ ok: true })
  })

  // DELETE /groups/:id — delete group (owner only)
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Grupo não encontrado.' })
    if (rows[0].owner_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })
    await query('DELETE FROM travel_groups WHERE id = $1', [request.params.id])
    return reply.send({ ok: true })
  })

  // GET /groups/:id/feed — posts shared to this group
  app.get('/:id/feed', { preHandler: [app.authenticate] }, async (request, reply) => {
    const viewerId = request.user.id
    const cursor   = request.query.cursor
    const limit    = 20

    // Check membership for private groups
    const { rows: meta } = await query(
      `SELECT is_private,
        EXISTS(SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2) AS is_member
       FROM travel_groups WHERE id = $1`,
      [request.params.id, viewerId],
    )
    if (meta.length === 0) return reply.status(404).send({ message: 'Grupo não encontrado.' })
    if (meta[0].is_private && !meta[0].is_member) return reply.status(403).send({ message: 'Grupo privado.' })

    const { rows } = await query(
      `SELECT p.*,
        u.username, u.display_name, u.avatar_url, u.is_verified,
        COUNT(DISTINCT pl.user_id) AS likes_count,
        COUNT(DISTINCT pc.id)      AS comments_count,
        EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $2) AS viewer_liked,
        EXISTS(SELECT 1 FROM bookmarks WHERE post_id = p.id AND user_id = $2)  AS viewer_saved
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN post_likes pl    ON pl.post_id = p.id
       LEFT JOIN post_comments pc ON pc.post_id = p.id
       WHERE p.group_id = $1
         AND ($3::uuid IS NULL OR p.id < $3)
       GROUP BY p.id, u.id
       ORDER BY p.created_at DESC
       LIMIT $4`,
      [request.params.id, viewerId, cursor ?? null, limit + 1],
    )

    const hasMore = rows.length > limit
    return reply.send({ posts: rows.slice(0, limit).map((r) => ({
      id: r.id, userId: r.user_id, username: r.username, displayName: r.display_name ?? r.username,
      avatarUrl: r.avatar_url, isVerified: r.is_verified ?? false, caption: r.caption,
      images: r.images ?? [], destination: r.destination, likesCount: Number(r.likes_count ?? 0),
      commentsCount: Number(r.comments_count ?? 0), viewerLiked: r.viewer_liked ?? false,
      viewerSaved: r.viewer_saved ?? false, createdAt: r.created_at,
    })), nextCursor: hasMore ? rows[limit - 1].id : null })
  })
}
