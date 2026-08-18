const fetch = require('node-fetch');
const { Client } = require('pg');

require("dotenv").config();

const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY; // Insira sua API Key do Foursquare
const BASE_URL = "https://api.foursquare.com/v3/places/search";

const dbClient = new Client({
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});


async function fetchLocationsFromDatabase() {
    try {
        const query = `SELECT id, city_name, latitude, longitude FROM country_cities;`; // Tabela `country_cities` contendo cidades
        const result = await dbClient.query(query);
        return result.rows; // Retorna as cidades com latitude e longitude
    } catch (error) {
        console.error("Erro ao buscar localizações do banco de dados:", error.message);
        return [];
    }
}

async function fetchTouristSpots(latitude, longitude, radius = 1000) {
    try {
        const categories = "16000,13000,12000,19000,11046"; // Múltiplas categorias adicionadas
        const url = `${BASE_URL}?ll=${latitude},${longitude}&radius=${radius}&categories=${categories}`;


        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": FOURSQUARE_API_KEY,
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Erro na API do Foursquare: ${response.statusText}`);
        }

        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error("Erro ao buscar dados do Foursquare:", error.message);
        return [];
    }
}

async function saveToDatabase(touristSpots, location_id) {
    try {
        for (const spot of touristSpots) {
            const query = `
                INSERT INTO tourist_spots (id, name, address, latitude, longitude, country_cities, type, popularity, price, rating)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO NOTHING;
            `;

            const values = [
                spot.fsq_id,
                spot.name,
                spot.location.address || "Desconhecido",
                spot.geocodes.main.latitude,
                spot.geocodes.main.longitude,
                location_id,
                spot.categories && spot.categories.length > 0 
                ? spot.categories[0].name // Tipo de monumento: usa a primeira categoria
                : "Desconhecido",
                spot.popularity,
                spot.price,
                spot.rating
            ];

            await dbClient.query(query, values);
        }

        console.log(`${touristSpots.length} pontos turísticos salvos no banco de dados.`);
    } catch (error) {
        console.error("Erro ao salvar no banco de dados:", error.message);
    }
}

async function main() {
    try {
        console.log("Conectando ao banco de dados...");
        await dbClient.connect();

        console.log("Buscando localizações no banco de dados...");
        const locations = await fetchLocationsFromDatabase();

        if (locations.length === 0) {
            console.log("Nenhuma localização encontrada.");
            return;
        }

        for (const location of locations) {
            console.log(`Buscando pontos turísticos em ${location.city_name}...`);
            const touristSpots = await fetchTouristSpots(location.latitude, location.longitude, 5000); // Exemplo: raio de 5km

            if (touristSpots.length === 0) {
                console.log(`Nenhum ponto turístico encontrado para ${location.city_name}.`);
                continue;
            }

            console.log(`Salvando pontos turísticos de ${location.city_name} no banco de dados...`);
            await saveToDatabase(touristSpots, location.id);
        }

        console.log("Processo concluído.");
    } catch (error) {
        console.error("Erro geral:", error.message);
    } finally {
        console.log("Encerrando conexão com o banco de dados...");
        await dbClient.end();
    }
}

main().catch(console.error);