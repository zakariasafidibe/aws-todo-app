const express = require('express');
const { Pool } = require('pg');
const AWS = require('@aws-sdk/client-secrets-manager');

const app = express();
app.use(express.json());

// Récupère les credentials DB depuis Secrets Manager (si disponible)
async function getDbConfig() {
  if (process.env.DB_SECRET_ARN) {
    const client = new AWS.SecretsManagerClient({ region: process.env.AWS_REGION || 'eu-west-1' });
    const secret = await client.send(new AWS.GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }));
    return JSON.parse(secret.SecretString);
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tododb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  };
}

let pool;

async function initDb() {
  const config = await getDbConfig();
  pool = new Pool(config);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Base de données initialisée');
}

// Routes
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.get('/todos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM todos ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/todos', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Le champ title est requis' });
  try {
    const result = await pool.query(
      'INSERT INTO todos (title) VALUES ($1) RETURNING *',
      [title]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/todos/:id', async (req, res) => {
  const { id } = req.params;
  const { done } = req.body;
  try {
    const result = await pool.query(
      'UPDATE todos SET done = $1 WHERE id = $2 RETURNING *',
      [done, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Todo non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/todos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM todos WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`)))
  .catch(err => { console.error('Erreur init DB:', err); process.exit(1); });
