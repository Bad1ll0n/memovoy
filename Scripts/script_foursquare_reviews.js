const { Pool } = require('pg');
const fetch = require('node-fetch');

require("dotenv").config();

// Substitua com sua chave de API do Foursquare
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY;

// Configuração de conexão com o PostgreSQL
const pool  = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});


// Função para buscar fsqIds da base de dados
async function fetchFsqIdsFromDB() {
    const client = await pool.connect();
    try {
      const query = 'SELECT id FROM tourist_spots;';
      const result = await client.query(query);
      return result.rows.map(row => row.id); // Retorna uma lista de fsq_ids
    } catch (error) {
      console.error('Erro ao buscar fsq_ids da base de dados:', error.message);
      return [];
    } finally {
      client.release();
    }
  }
  
  // Função para buscar reviews de um local na Foursquare API
async function fetchReviews(fsqId) {
  try {
    const url = `https://api.foursquare.com/v3/places/${fsqId}/tips`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": FOURSQUARE_API_KEY,
        "Accept": "application/json"
      }
    });

    const data = await response.json();
    return data; // Supondo que as reviews estão em `results`

  } catch (error) {
    console.error(`Erro ao buscar reviews para o fsq_id ${fsqId}:`, error.message);
    return [];
  }
}
  
  // Função para inserir reviews no banco de dados
  async function insertReviewsIntoDB(fsqId, reviews) {
    const client = await pool.connect();
  
    try {
      await client.query('BEGIN');
  
      for (const review of reviews) {
        const query = `
          INSERT INTO spots_reviews (id,tourist_spots_id, comment, created_at, user_name)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING;
        `;
  
        const values = [
          review.id,
          fsqId,
          review.text,
          review.created_at || new Date().toISOString(),
          review.user?.name || 'Anônimo',
        ];
  
        await client.query(query, values);
      }
  
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Erro ao inserir reviews no banco para fsq_id ${fsqId}:`, error.message);
    } finally {
      client.release();
    }
  }
  
  // Função principal para processar os fsq_ids
  async function processLocations() {
    const fsqIds = await fetchFsqIdsFromDB(); // Buscar fsqIds do banco de dados
  
    if (fsqIds.length === 0) {
      console.log('Nenhum fsq_id encontrado na base de dados.');
      return;
    }
  
    for (const fsqId of fsqIds) {
      console.log(`Processando fsq_id: ${fsqId}`);
      const reviews = await fetchReviews(fsqId);
      if (reviews.length > 0) {
        await insertReviewsIntoDB(fsqId, reviews);
        console.log(`Inseridas ${reviews.length} reviews para fsq_id: ${fsqId}`);
      } else {
        console.log(`Nenhuma review encontrada para fsq_id: ${fsqId}`);
      }
    }
  }
  
  // Inicia o processo
  processLocations()
    .then(() => {
      console.log('Processamento concluído.');
      pool.end();
    })
    .catch((error) => {
      console.error('Erro no processamento:', error.message);
      pool.end();
    });