require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { initDatabase } = require('./db/init');

const authRoutes = require('./routes/auth');
const paymentProviderRoutes = require('./routes/paymentProvider');
const webhookRoutes = require('./routes/webhooks');
const paymentRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
const allowedOrigins = [
  'http://localhost:5173',
  'https://swd-olive.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Servir arquivos estáticos (checkout.js e frontend build)
app.use('/static', express.static(path.join(__dirname, '../public')));

// Servir frontend em produção
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
}

// Routes
app.use('/auth', authRoutes);
app.use('/payment-provider', paymentProviderRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/payments', paymentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Servir frontend em produção (catch-all para React Router)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Inicializar banco de dados e depois iniciar servidor
async function startServer() {
  try {
    console.log('💾 Inicializando banco de dados SQLite...');
    await initDatabase();
    console.log('✓ Banco de dados inicializado com sucesso');

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📱 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Banco de dados: SQLite (database.sqlite)`);
    });
  } catch (error) {
    console.error('❌ Erro ao inicializar servidor:', error);
    process.exit(1);
  }
}

startServer();
