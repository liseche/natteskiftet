// Natteskiftet – spillet. Du har nattevakt i Halloween-uka, fem alarmer går, og
// for hver alarm gjetter du hvilke logger varulven gjemmer seg i før agenten tar over.
//   node src/spill.js                spill med agenten (API-kall for hver alarm)
//   node src/spill.js --uten-agent   bare spillet, ingen API-kall
//   --stille                         ingen opplesning
//   --fort                           ingen skrivemaskineffekt
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { setTimeout as vent } from 'node:timers/promises';
import { system, verktøy } from './verktoy.js';
import { ekstraVerktøy, hentAlarmer } from './ekstra-verktoy.js';
import { banner, overskrift } from './show.js';

const gyldige = ['--uten-agent', '--stille', '--fort'];
const flagg = process.argv.slice(2);
const ukjente = flagg.filter((f) => !gyldige.includes(f));
if (ukjente.length) {
  console.error(`Ukjent valg ${ukjente.join(', ')}. Gyldige: ${gyldige.join(', ')}`);
  process.exit(1);
}
const utenAgent = flagg.includes('--uten-agent');
const stille = flagg.includes('--stille');
const fort = flagg.includes('--fort');

if (!process.stdin.isTTY) {
  console.error('Spillet må kjøres i en terminal.');
  process.exit(1);
}

let kjørAgent;
if (!utenAgent) {
  try {
    process.loadEnvFile();
  } catch {
    // Ingen .env — da må ANTHROPIC_API_KEY være satt i miljøet.
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Mangler ANTHROPIC_API_KEY. Lim den inn i .env, eller spill uten agent: node src/spill.js --uten-agent');
    process.exit(1);
  }
  // Som i index.js: agent.js leser miljøet idet den lastes, så den må komme etter .env.
  ({ kjørAgent } = await import('./agent.js'));
}

const oransje = (t) => `\x1b[38;5;208m${t}\x1b[0m`;
const grå = (t) => `\x1b[90m${t}\x1b[0m`;
const rød = (t) => `\x1b[31m${t}\x1b[0m`;
const gul = (t) => `\x1b[33m${t}\x1b[0m`;
const grønn = (t) => `\x1b[32m${t}\x1b[0m`;
const fet = (t) => `\x1b[1m${t}\x1b[0m`;

// Fasiten bygger på dataene: hvor sporet faktisk ligger, og hvilket tidsvindu
// som viser det. varm er logger som ikke er årsaken, men peker videre mot den.
const natta = {
  'ALARM-0305': {
    scene: '03:05. Noe knirker ute i gangen. Du snur deg. Ingen der.\nSå piper telefonen.',
    valg: ['api-gateway', 'innlogging', 'kunde-db', 'varsling'],
    riktig: 'innlogging',
    vindu: ['03:00', '03:10'],
    varulv: 'Bare en skygge. Loggrotasjonen kl 03:00 fylte disken en liten stund. Falsk alarm.',
  },
  'ALARM-0312': {
    scene: '03:12. Kaffen er kald. Lampa over pulten flakker.\nTelefonen vibrerer igjen, hardere denne gangen.',
    valg: ['api-gateway', 'kunde-db', 'betaling', 'varsling'],
    riktig: 'betaling',
    vindu: ['02:50', '02:56'],
    varulv: 'Versjon 2.14.0 av betaling, rullet ut 02:51. Den tåler ikke utenlandske kort.',
  },
  'ALARM-0320': {
    scene: '03:20. Noe skraper mot vinduet. En grein, sier du til deg selv.\nSkjermen blinker rødt.',
    valg: ['sok', 'api-gateway', 'kunde-db', 'innlogging'],
    riktig: 'sok',
    vindu: ['03:00', '03:12'],
    varulv: 'Den nattlige reindeksen startet som fullindeks og kvalte sok-node-2.',
  },
  'ALARM-0331': {
    scene: '03:31. Ute uler det igjen, nærmere nå.\nDu prøver å logge inn på telefonen. Engangskoden kommer aldri.',
    valg: ['innlogging', 'api-gateway', 'varsling', 'kunde-db'],
    riktig: 'varsling',
    vindu: ['03:22', '03:31'],
    varulv: 'SmsBud sliter med timeout, og den nye retry-policyen fra 26. oktober gjør det trolig verre (HTTP 429).',
  },
  'ALARM-0340': {
    scene: '03:40. Alle skjermene blir røde på én gang.\nI korridoren slukner lysene, ett etter ett. Kundene kommer ikke inn på Min side.',
    valg: ['api-gateway', 'innlogging', 'betaling', 'kunde-db'],
    riktig: 'kunde-db',
    varm: 'innlogging',
    vindu: ['03:30', '03:36'],
    varulv: 'Cron-jobben i kunde-db, flyttet til torsdag 03:30, låste sesjoner-tabellen. Gatewayen var bare budbringeren.',
  },
};

async function skriv(tekst, fart = 22) {
  if (fort) return console.log(tekst);
  for (const tegn of tekst) {
    process.stdout.write(tegn);
    await vent(tegn === '\n' ? fart * 12 : fart);
  }
  process.stdout.write('\n');
}

// Nora leser korte replikker. Venter ikke på henne, så teksten kan skrives mens hun snakker.
function si(tekst) {
  if (stille || process.platform !== 'darwin') return;
  spawn('say', ['-v', 'Nora', tekst], { stdio: 'ignore' }).on('error', () => {});
}

// Nytt grensesnitt per spørsmål, så det ikke krangler med vekk_vakt om tastaturet mens agenten kjører.
async function spør(tekst) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => {
    rl.close();
    console.log(grå('\n\n  Du flykter ut i natta. 🏃'));
    process.exit(130);
  });
  try {
    return (await rl.question(tekst)).trim();
  } finally {
    rl.close();
  }
}

async function velg(valg) {
  for (;;) {
    const i = Number(await spør(oransje(`\n  Velg 1-${valg.length}: `))) - 1;
    if (valg[i]) return valg[i];
    console.log(grå(`  Skriv et tall fra 1 til ${valg.length}.`));
  }
}

const sokILogger = verktøy.find((v) => v.definisjon.name === 'sok_i_logger').kjør;

async function visLogger(tjeneste, [fra, til]) {
  const tekst = await sokILogger({ tjeneste, fra, til, maks: 8 });
  for (const linje of tekst.split('\n')) {
    // "2026-10-29T03:00:01+01:00 innlogging INFO ..." blir "03:00:01 INFO ...".
    const kort = linje.replace(/^\S+T(\d\d:\d\d:\d\d)\S*\s+\S+\s+/, '$1 ');
    const farge = / ERROR /.test(` ${kort} `) ? rød : / WARN /.test(` ${kort} `) ? gul : grå;
    console.log(`    ${farge(kort)}`);
  }
}

banner();
await skriv(`
Det er natt til 29. oktober, og klokka er 02:40.
Du trakk det korteste strået: natteskiftet i Halloween-uka.
Tåka ligger tjukk over byen. Gatelysene slukner ett etter ett bak deg.
Et sted langt borte uler noe. Sikkert bare en hund.
Kontoret er mørkt. Bare serverrommet summer.
Du setter deg, tar en slurk kald kaffe og logger inn.`);
await skriv(kjørAgent
  ? 'Ved siden av deg blinker en markør. Natteskift-agenten våkner: «Jeg er her. Vi tar natta sammen.»'
  : 'Agenten sover i natt. Du er helt alene.');
si('Velkommen til natteskiftet.');

console.log(`
  ${fet('Slik spiller du')}
  Når en alarm går, peker landsbyen på tjenesten som skriker høyest.
  Men den som skriker, er ikke alltid varulven. Velg hvilke logger du vil granske.
  🎯 Riktig spor gir 100 poeng. 🔥 Et varmt spor gir 50.${kjørAgent ? '\n  Etterpå graver agenten videre og forteller hva den fant, og hva den ikke vet.' : ''}`);
await spør(oransje('\n  Trykk Enter for å ta på deg hodelykta … '));

const alarmer = hentAlarmer();
const resultater = [];
let poeng = 0;

for (const alarm of alarmer) {
  const kapittel = natta[alarm.id];
  const kl = alarm.tid.slice(11, 16);
  overskrift(`${kl} · ${alarm.tittel}`);
  await skriv(`\n${kapittel.scene}`);
  process.stdout.write('\x07');
  console.log(rød(`\n  🚨 ALARM ${kl} · ${alarm.tjeneste} · ${alarm.alvorlighet.toUpperCase()}`));
  console.log(rød(`     ${alarm.tekst}`));
  si(`Alarm fra ${alarm.tjeneste}. ${alarm.tittel}.`);

  console.log(`\n  Landsbyen peker på ${fet(alarm.tjeneste)}. Men er det den som er varulven?`);
  console.log('  Hvilke logger vil du granske?\n');
  kapittel.valg.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
  const valgt = await velg(kapittel.valg);

  console.log(grå(`\n  🔦 Du lyser på loggene til ${valgt} …\n`));
  await visLogger(valgt, kapittel.vindu);

  const treff = valgt === kapittel.riktig ? 'riktig' : valgt === kapittel.varm ? 'varm' : 'kald';
  if (treff === 'riktig') console.log(grønn('\n  🎯 Riktig spor! +100. Her er det klør i snøen.'));
  if (treff === 'varm') console.log(gul('\n  🔥 Varmt spor! +50. Disse loggene peker videre mot noe annet …'));
  if (treff === 'kald') console.log(grå('\n  👻 Kaldt spor. Bare vinden her. +0'));
  poeng += { riktig: 100, varm: 50, kald: 0 }[treff];
  resultater.push({ alarm, kl, kapittel, valgt, treff });

  if (kjørAgent) {
    console.log(oransje('\n  🤖 Natteskift-agenten tar over og graver videre …\n'));
    const oppgave = `ALARM kl ${kl} natt til 29. oktober: ${alarm.tekst}\nVakta så først i loggene til ${valgt}.`;
    await kjørAgent({ system, oppgave, verktøy: [...verktøy, ...ekstraVerktøy] });
  }
  await spør(grå('\n  Trykk Enter når du er klar for resten av natta … '));
}

overskrift('Morgengry');
await skriv(`
Klokka er 03:50. Alarmene har stilnet.
Gjennom vinduet ser du en grå stripe over åsene. Langt borte uler det en siste gang.
Du overlevde natteskiftet.`);
si('Du overlevde natteskiftet.');

console.log(oransje('\n  🐺 Rollene avsløres. Nattens varulver var:\n'));
for (const { alarm, kl, kapittel, valgt, treff } of resultater) {
  const merke = { riktig: grønn('🎯'), varm: gul('🔥'), kald: grå('👻') }[treff];
  console.log(`  ${merke} ${fet(`${kl} ${alarm.tjeneste}`)}: ${kapittel.varulv}`);
  if (treff !== 'riktig') console.log(grå(`       Du så i ${valgt}. Sporet lå i ${kapittel.riktig}.`));
}

const maks = alarmer.length * 100;
const tittel = poeng >= maks * 0.9 ? '🐺 Varulvjeger'
  : poeng >= maks * 0.6 ? '🕯️  Nattevakt med lykt'
  : poeng >= maks * 0.3 ? '🦇 Flaggermus i serverrommet'
  : '👻 Spøkelse i maskinen';
console.log(`\n  ${fet(`Poeng: ${poeng} av ${maks}`)} · ${oransje(tittel)}\n`);
