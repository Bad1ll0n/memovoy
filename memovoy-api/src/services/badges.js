import { query } from '../db/pool.js'

const BADGE_DEFINITIONS = {
  FIRST_POST:        'Publicaste o teu primeiro post! 🎉',
  FIRST_LIKE:        'Recebeste o teu primeiro like! ❤️',
  FIRST_FOLLOWER:    'Tens o teu primeiro seguidor! 👥',
  FIRST_ITINERARY:   'Criaste o teu primeiro roteiro! 🗺️',
  EXPLORER_10:       'Visitaste 10 destinos diferentes! 🌍',
  FOLLOWERS_50:      'Chegaste aos 50 seguidores! 🌟',
  FOLLOWERS_100:     'Chegaste aos 100 seguidores! 🏆',
  ITINERARIES_5:     'Criaste 5 roteiros! ✈️',
  ITINERARIES_10:    'Criaste 10 roteiros — és um planeador nato! 📅',
  COUNTRIES_20:      'Visitaste 20 países diferentes! 🌐',
  POSTS_10:          'Chegaste aos 10 posts! 📸',
  POSTS_50:          'Chegaste aos 50 posts — voz da comunidade! 🎙️',
}

/**
 * Try to award a badge to a user. No-op if already awarded.
 * Creates a notification if new.
 * @param {string} userId
 * @param {keyof typeof BADGE_DEFINITIONS} code
 */
export async function awardBadge(userId, code) {
  const message = BADGE_DEFINITIONS[code]
  if (!message) return

  try {
    const { rowCount } = await query(
      'INSERT INTO user_badges (user_id, badge_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, code],
    )

    if (rowCount > 0) {
      await query(
        // O id vai como dois parâmetros de propósito. Usá-lo uma só vez fazia o
        // Postgres vê-lo como UUID (recipient_id) e como texto (concatenação) e
        // recusar-se a inferir um tipo: "inconsistent types deduced for
        // parameter $1". A query falhava sempre, o catch abaixo engolia o erro,
        // e os badges eram atribuídos sem ninguém ser notificado.
        //
        // Um cast duplo ($1::uuid e $1::text) também resolve, mas obriga quem
        // lê a reconstruir este raciocínio. Dois parâmetros não têm ambiguidade.
        `INSERT INTO notifications (recipient_id, type, message, target_url)
         VALUES ($1, 'badge', $2, '/profile/' || $3)`,
        [userId, message, userId],
      )
      if (global._io) {
        global._io.to(`user:${userId}`).emit('new_notification', { type: 'badge' })
      }
    }
  } catch (err) {
    console.error('[badges] awardBadge failed:', err.message)
  }
}

/**
 * Check and award FIRST_POST + POSTS_10 + POSTS_50 badges.
 */
export async function checkFirstPost(userId) {
  const { rows } = await query(
    'SELECT COUNT(*) AS cnt FROM posts WHERE user_id = $1',
    [userId],
  )
  const cnt = Number(rows[0].cnt)
  if (cnt === 1)  await awardBadge(userId, 'FIRST_POST')
  if (cnt === 10) await awardBadge(userId, 'POSTS_10')
  if (cnt === 50) await awardBadge(userId, 'POSTS_50')
}

/**
 * Check and award FIRST_LIKE badge (for the post author who received the like).
 */
export async function checkFirstLike(authorId) {
  const { rows } = await query(
    `SELECT COUNT(*) AS cnt FROM post_likes pl
     JOIN posts p ON p.id = pl.post_id
     WHERE p.user_id = $1`,
    [authorId],
  )
  if (Number(rows[0].cnt) === 1) {
    await awardBadge(authorId, 'FIRST_LIKE')
  }
}

/**
 * Check and award FIRST_FOLLOWER + FOLLOWERS_50 + FOLLOWERS_100 badges.
 */
export async function checkFirstFollower(followedId) {
  const { rows } = await query(
    'SELECT COUNT(*) AS cnt FROM follows WHERE following_id = $1',
    [followedId],
  )
  const cnt = Number(rows[0].cnt)
  if (cnt === 1)   await awardBadge(followedId, 'FIRST_FOLLOWER')
  if (cnt === 50)  await awardBadge(followedId, 'FOLLOWERS_50')
  if (cnt === 100) await awardBadge(followedId, 'FOLLOWERS_100')
}

/**
 * Check and award FIRST_ITINERARY + EXPLORER_10 + COUNTRIES_20 + ITINERARIES_5 + ITINERARIES_10 badges.
 */
export async function checkItineraryBadges(userId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT NULLIF(destination, '')) AS unique_destinations
     FROM itineraries WHERE user_id = $1`,
    [userId],
  )
  const { total, unique_destinations } = rows[0]
  const t = Number(total)
  const d = Number(unique_destinations)
  if (t === 1)  await awardBadge(userId, 'FIRST_ITINERARY')
  if (t === 5)  await awardBadge(userId, 'ITINERARIES_5')
  if (t === 10) await awardBadge(userId, 'ITINERARIES_10')
  if (d >= 10)  await awardBadge(userId, 'EXPLORER_10')
  if (d >= 20)  await awardBadge(userId, 'COUNTRIES_20')
}
