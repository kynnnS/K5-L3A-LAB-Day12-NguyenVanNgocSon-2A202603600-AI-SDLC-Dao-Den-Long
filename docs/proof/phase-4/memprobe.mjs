const root = process.argv[2];
const { parseTuning } = await import(root + '/build/core/tuning.js');
const { playRandomNight } = await import(root + '/build/headless/soak-core.js');
const fs = await import('node:fs');
const T = parseTuning(JSON.parse(fs.readFileSync(root + '/game.contract.json', 'utf8')));
const m = () => { gc(); const u = process.memoryUsage(); return `rss=${(u.rss/1048576).toFixed(1)} heapUsed=${(u.heapUsed/1048576).toFixed(2)} heapTotal=${(u.heapTotal/1048576).toFixed(1)} ext=${(u.external/1048576).toFixed(1)}`; };
console.log('start', m());
for (let i = 1; i <= 60; i++) { const s = playRandomNight(T, ((i-1)%3)+1, 7+i); if (i % 10 === 0 || i <= 3) console.log(i, s.status, s.tick, m()); }
