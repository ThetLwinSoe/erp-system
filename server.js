require('dotenv').config();
const app = require('./app');
const db = require('./src/models');

const PORT = process.env.PORT || 3000;

// Database connection and server start
db.sequelize
  .authenticate()
  .then(() => {
    console.log('Database connection established successfully.');

    // Sync database (in development, you might use { force: true } to recreate tables)
    return db.sequelize.sync({ alter: true });
  })
  .then(() => {
    console.log('Database synchronized.');

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });
