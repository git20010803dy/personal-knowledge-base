const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./data/knowledge.db'));

  const rows = db.exec(`
    SELECT id, title, category, tags 
    FROM knowledge_items 
    WHERE title LIKE '%蒋介石%' OR title LIKE '%毛泽东%'
  `);

  if (!rows.length) { console.log('未找到'); return; }

  rows[0].values.forEach(r => {
    console.log('标题:', r[1]);
    console.log('category:', JSON.stringify(r[2]));
    console.log('tags:', r[3]);
    console.log('---');
  });

  db.close();
}

main();
