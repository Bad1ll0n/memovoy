import { query } from '../db/pool.js'

// ISO 3166-1 alpha-2 lookup for common English country names returned by the AI
const COUNTRY_CODES = {
  'Afghanistan':'AF','Albania':'AL','Algeria':'DZ','Andorra':'AD','Angola':'AO',
  'Argentina':'AR','Armenia':'AM','Australia':'AU','Austria':'AT','Azerbaijan':'AZ',
  'Bahamas':'BS','Bahrain':'BH','Bangladesh':'BD','Belarus':'BY','Belgium':'BE',
  'Belize':'BZ','Benin':'BJ','Bhutan':'BT','Bolivia':'BO','Bosnia and Herzegovina':'BA',
  'Botswana':'BW','Brazil':'BR','Brunei':'BN','Bulgaria':'BG','Burkina Faso':'BF',
  'Cambodia':'KH','Cameroon':'CM','Canada':'CA','Cape Verde':'CV','Chile':'CL',
  'China':'CN','Colombia':'CO','Congo':'CG','Costa Rica':'CR','Croatia':'HR',
  'Cuba':'CU','Cyprus':'CY','Czech Republic':'CZ','Czechia':'CZ',
  'Denmark':'DK','Dominican Republic':'DO','DR Congo':'CD',
  'Ecuador':'EC','Egypt':'EG','El Salvador':'SV','Estonia':'EE','Eswatini':'SZ',
  'Ethiopia':'ET','Finland':'FI','France':'FR','Gabon':'GA','Georgia':'GE',
  'Germany':'DE','Ghana':'GH','Greece':'GR','Guatemala':'GT','Guinea':'GN',
  'Honduras':'HN','Hungary':'HU','Iceland':'IS','India':'IN','Indonesia':'ID',
  'Iran':'IR','Iraq':'IQ','Ireland':'IE','Israel':'IL','Italy':'IT',
  'Jamaica':'JM','Japan':'JP','Jordan':'JO','Kazakhstan':'KZ','Kenya':'KE',
  'Kosovo':'XK','Kuwait':'KW','Kyrgyzstan':'KG','Laos':'LA','Latvia':'LV',
  'Lebanon':'LB','Libya':'LY','Liechtenstein':'LI','Lithuania':'LT','Luxembourg':'LU',
  'Madagascar':'MG','Malawi':'MW','Malaysia':'MY','Maldives':'MV','Mali':'ML',
  'Malta':'MT','Mexico':'MX','Moldova':'MD','Monaco':'MC','Mongolia':'MN',
  'Montenegro':'ME','Morocco':'MA','Mozambique':'MZ','Myanmar':'MM',
  'Namibia':'NA','Nepal':'NP','Netherlands':'NL','New Zealand':'NZ','Nicaragua':'NI',
  'Niger':'NE','Nigeria':'NG','North Korea':'KP','North Macedonia':'MK',
  'Norway':'NO','Oman':'OM','Pakistan':'PK','Palestine':'PS','Panama':'PA',
  'Papua New Guinea':'PG','Paraguay':'PY','Peru':'PE','Philippines':'PH',
  'Poland':'PL','Portugal':'PT','Qatar':'QA',
  'Romania':'RO','Russia':'RU','Rwanda':'RW',
  'Saudi Arabia':'SA','Senegal':'SN','Serbia':'RS','Sierra Leone':'SL',
  'Singapore':'SG','Slovakia':'SK','Slovenia':'SI','Somalia':'SO',
  'South Africa':'ZA','South Korea':'KR','South Sudan':'SS','Spain':'ES',
  'Sri Lanka':'LK','Sudan':'SD','Sweden':'SE','Switzerland':'CH','Syria':'SY',
  'Taiwan':'TW','Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH','Togo':'TG',
  'Tunisia':'TN','Turkey':'TR','Turkmenistan':'TM','Uganda':'UG','Ukraine':'UA',
  'United Arab Emirates':'AE','UAE':'AE','United Kingdom':'GB','UK':'GB',
  'United States':'US','USA':'US','Uruguay':'UY','Uzbekistan':'UZ',
  'Venezuela':'VE','Vietnam':'VN','Yemen':'YE','Zambia':'ZM','Zimbabwe':'ZW',
}

function toCountryCode(name) {
  if (!name) return ''
  return COUNTRY_CODES[name] ?? COUNTRY_CODES[name.trim()] ?? ''
}

export async function mapRoutes(app) {
  // GET /map/countries — aggregate all public itineraries by country
  app.get('/countries', async (request, reply) => {
    const { rows } = await query(
      `SELECT country, COUNT(*) AS count
       FROM itineraries
       WHERE is_public = TRUE AND country IS NOT NULL
       GROUP BY country
       ORDER BY count DESC`,
    )

    reply.send(
      rows.map((r) => ({
        countryCode: toCountryCode(r.country),
        countryName: r.country,
        count:       Number(r.count),
      })),
    )
  })

  // GET /map/mine — aggregate the authenticated user's itineraries by country
  app.get('/mine', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      `SELECT country, COUNT(*) AS count
       FROM itineraries
       WHERE user_id = $1 AND country IS NOT NULL
       GROUP BY country
       ORDER BY count DESC`,
      [request.user.id],
    )

    reply.send(
      rows.map((r) => ({
        countryCode: toCountryCode(r.country),
        countryName: r.country,
        count:       Number(r.count),
      })),
    )
  })

  // GET /map/users/:id — public itineraries of a specific user, grouped by country
  app.get('/users/:id', async (request, reply) => {
    const { rows } = await query(
      `SELECT country, COUNT(*) AS count
       FROM itineraries
       WHERE user_id = $1 AND is_public = TRUE AND country IS NOT NULL
       GROUP BY country
       ORDER BY count DESC`,
      [request.params.id],
    )

    reply.send(
      rows.map((r) => ({
        countryCode: toCountryCode(r.country),
        countryName: r.country,
        count:       Number(r.count),
      })),
    )
  })
}
