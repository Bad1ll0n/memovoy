const axios = require('axios');
const { Pool } = require('pg');

require("dotenv").config();

// Configurações da API GeoNames
const GEONAMES_USERNAME = process.env.GEONAMES_USERNAME; // Substitua pelo seu usuário GeoNames

// Configurações do Banco de Dados PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT, // Porta padrão do PostgreSQL
});

// Lista de Códigos de Países ISO Alpha-2
const COUNTRY_CODES = ["PT"];

// Função para buscar cidades e concelhos por país
async function fetchCitiesAndCountiesByCountry(countryCode, maxRows = 1000) {
  const url = `http://api.geonames.org/searchJSON?formatted=true&username=${GEONAMES_USERNAME}&country=${countryCode}&maxRows=${maxRows}`;
  
  try {
    const response = await axios.get(url);
    const allLocations = response.data.geonames || [];
    
    //console.log(allLocations);

    // Filtrar apenas cidades e concelhos
    return allLocations.filter(location => 
      location.fcl === "P" //|| location.fcode === "ADM2"
    );

    
  } catch (error) {
    console.error(`Erro ao buscar cidades/concelhos para o país ${countryCode}:`, error.message);
    return [];
  }
}

// Função para verificar se a cidade já está na base de dados
async function isCityInDatabase(cityName, countryCode) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 1 
      FROM country_cities 
      WHERE city_name = $1 AND country_code = $2 
      LIMIT 1;
    `;
    const result = await client.query(query, [cityName, countryCode]);
    return result.rowCount > 0; // Retorna true se a cidade já existe
  } catch (error) {
    console.error("Erro ao verificar cidade no banco de dados:", error.message);
    return false;
  } finally {
    client.release(); // Libera o cliente de volta para o pool
  }
}

// Função para salvar apenas cidades e concelhos na base de dados
async function saveCitiesAndCountiesToDatabase(locations) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN"); // Inicia uma transação

    for (const location of locations) {
      const { countryName, countryCode, toponymName, featureCode, lat, lng } = location;

      // Determina o tipo (cidade ou concelho)
      const type = featureCode === "ADM2" ? "concelho" : "cidade";

      // Verifica se já existe no banco
      const cityExists = await isCityInDatabase(toponymName, countryCode);

      if (!cityExists) {
        const query = `
          INSERT INTO country_cities (country_name, country_code, city_name, type, latitude, longitude)
          VALUES ($1, $2, $3, $4, $5, $6);
        `;

        const values = [countryName, countryCode, toponymName, type, lat, lng];

        await client.query(query, values);
        console.log(`Localidade ${toponymName} (${type}) inserida com sucesso!`);
      } else {
        console.log(`Localidade ${toponymName} já existe no banco.`);
      }
    }

    await client.query("COMMIT");
    console.log("Cidades e concelhos salvos no banco de dados com sucesso!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao salvar no banco de dados:", error.message);
  } finally {
    client.release(); // Libera o cliente de volta para o pool
  }
}

// Atualiza a função principal
async function main() {
  for (const countryCode of COUNTRY_CODES) {
    console.log(`Buscando cidades e concelhos para o país: ${countryCode}...`);
    const locations = await fetchCitiesAndCountiesByCountry(countryCode);

    if (locations.length > 0) {
      console.log(`Encontradas ${locations.length} localidades para ${countryCode}. Salvando no banco...`);
      await saveCitiesAndCountiesToDatabase(locations);
    } else {
      console.log(`Nenhuma localidade encontrada para ${countryCode}.`);
    }
  }

  console.log("Processo concluído!");
  pool.end(); // Fecha o pool de conexões
}

main().catch((error) => console.error("Erro na execução do script:", error.message));