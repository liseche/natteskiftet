// Natteskiftet med alt på: flere verktøy, vekking av vakt og litt Halloween.
//   node src/natt.js                         eksempelalarmen (betaling kl 03:12)
//   node src/natt.js "ALARM kl 03:40: ..."   en egen alarm
//   node src/natt.js --hele-natta            alle alarmene i natt, så en morgenrapport
//   --stille                                 ikke les opp rapporten
import { system, eksempelOppgave, verktøy } from './verktoy.js';
import { ekstraVerktøy, hentAlarmer } from './ekstra-verktoy.js';
import { banner, overskrift, lesOpp } from './show.js';

try {
  process.loadEnvFile();
} catch {
  // Ingen .env — da må ANTHROPIC_API_KEY være satt i miljøet.
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Mangler ANTHROPIC_API_KEY. Kopier .env.example til .env og lim inn nøkkelen.');
  process.exit(1);
}

// Som i index.js: agent.js leser miljøet idet den lastes, så den må komme etter .env.
const { kjørAgent } = await import('./agent.js');

const args = process.argv.slice(2);
const flagg = args.filter((a) => a.startsWith('--'));
const ukjente = flagg.filter((f) => !['--hele-natta', '--stille'].includes(f));
if (ukjente.length) {
  console.error(`Ukjent flagg ${ukjente.join(', ')}. Gyldige: --hele-natta, --stille`);
  process.exit(1);
}
const heleNatta = flagg.includes('--hele-natta');
const stille = flagg.includes('--stille');
const egenAlarm = args.filter((a) => !a.startsWith('--')).join(' ');
if (heleNatta && egenAlarm) {
  console.error('--hele-natta tar alarmene fra data/alarmer.json og kan ikke kombineres med en egen alarm.');
  process.exit(1);
}

const alleVerktøy = [...verktøy, ...ekstraVerktøy];
const tekstFra = (svar) => svar?.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() ?? '';

const morgenSystem = `Natta er over, og klokka er ca 03:50. Du har fått rapportene natteskift-agenten skrev for hver alarm, én og én.
Nå skal du se dem samlet og skrive en morgenrapport til dagvakta.
Rapportene kan ta feil eller være uenige. Bruk verktøyene til å sjekke det som er uklart i stedet for å gjenta det de sier.
Skill mellom det du har sett i dataene og det du antar. Si eksplisitt hva ingen vet ennå.
Bruk vekk_vakt bare for det som fortsatt er ødelagt for brukerne, og vekk høyst én person per rotårsak.

Morgenrapporten erstatter den vanlige situasjonsrapporten. Skriv den på norsk:
- Én linje per alarm: ekte feil, følgefeil av en annen alarm, eller kjent støy.
- Hvilke alarmer som henger sammen, og hva i dataene som viser det. At de kom nær hverandre, er ikke bevis.
- Runbooks som ikke stemmer med det du ser.
- Hvem som er vekket eller bør vekkes, og hvorfor.
- Hva ingen vet ennå.`;

banner();

if (heleNatta) {
  // Først hver alarm for seg, uten lov til å vekke noen. Vekking bestemmes i
  // morgenrapporten, når agenten ser hele bildet og ikke vekker fem for én feil.
  const utenVekking = alleVerktøy.filter((v) => v.definisjon.name !== 'vekk_vakt');
  const rapporter = [];
  for (const alarm of hentAlarmer()) {
    const oppgave = `ALARM kl ${alarm.tid.slice(11, 16)} natt til 29. oktober: ${alarm.tekst}`;
    overskrift(`${alarm.id} · ${alarm.tittel}`);
    console.log(`\n🎃 ${oppgave}\n`);
    const svar = await kjørAgent({ system, oppgave, verktøy: utenVekking });
    const rapport = tekstFra(svar) || 'Ingen rapport: agenten ble ikke ferdig innen MAX_ITERASJONER.';
    rapporter.push(`## ${alarm.id} (${alarm.tjeneste}, ${alarm.alvorlighet})\n${oppgave}\n\n${rapport}`);
  }

  overskrift('Morgenrapport');
  const svar = await kjørAgent({ system: morgenSystem, oppgave: rapporter.join('\n\n'), verktøy: alleVerktøy });
  if (!stille) await lesOpp(tekstFra(svar));
} else {
  const oppgave = egenAlarm || eksempelOppgave;
  console.log(`\n🎃 ${oppgave}\n`);
  const svar = await kjørAgent({ system, oppgave, verktøy: alleVerktøy });
  if (!stille) await lesOpp(tekstFra(svar));
}
