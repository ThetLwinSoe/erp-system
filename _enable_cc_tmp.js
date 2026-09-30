require('dotenv').config();
const { Company } = require('./src/models');
(async () => {
  await Company.update({ creditControlEnabled: true }, { where: { id: 5 } });
  const c = await Company.findByPk(5, { raw: true });
  console.log('creditControlEnabled:', c.creditControlEnabled);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
