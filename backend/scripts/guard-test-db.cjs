const fs = require('node:fs');
const dotenv = require('dotenv');
if (!fs.existsSync('.env.test')) throw new Error('A dedicated .env.test is required.');
const config = dotenv.parse(fs.readFileSync('.env.test'));
if (!config.DB_NAME || !config.DB_NAME.endsWith('_test') || !['127.0.0.1', 'localhost'].includes(config.DB_HOST)) {
  throw new Error('Legacy tests require a localhost database with a name ending in _test.');
}
