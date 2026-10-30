// Ekstra verktøy for natt.js: tjenesteoversikt, nattens alarmer og vekking av
// vakt. Ligger i egen fil så verktoy.js og npm start er urørt.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const DATA = path.join(import.meta.dirname, '..', 'data');
const lesJson = (fil) => JSON.parse(fs.readFileSync(path.join(DATA, fil), 'utf8'));

const oransje = (t) => `\x1b[38;5;208m${t}\x1b[0m`;
const grå = (t) => `\x1b[90m${t}\x1b[0m`;

function finnTjeneste(navn, tjenester = lesJson('tjenester.json')) {
  const t = tjenester.find((t) => t.navn === navn);
  if (!t) throw new Error(`Ukjent tjeneste «${navn}». Gyldige: ${tjenester.map((t) => t.navn).join(', ')}`);
  return t;
}

function hentTjeneste({ tjeneste } = {}) {
  const tjenester = lesJson('tjenester.json');
  // avhengigheter sier hva tjenesten trenger. brukes_av er motsatt vei: hvem som rammes hvis den feiler.
  const medBrukere = (t) => ({
    ...t,
    brukes_av: tjenester.filter((a) => a.avhengigheter.includes(t.navn)).map((a) => a.navn),
  });
  if (!tjeneste) return tjenester.map(medBrukere);
  return medBrukere(finnTjeneste(tjeneste, tjenester));
}

export function hentAlarmer({ tjeneste } = {}) {
  if (tjeneste) finnTjeneste(tjeneste);
  const alarmer = lesJson('alarmer.json')
    .filter((a) => !tjeneste || a.tjeneste === tjeneste)
    .sort((a, b) => Date.parse(a.tid) - Date.parse(b.tid));
  if (alarmer.length === 0) return `Ingen alarmer for «${tjeneste}» i natt. Det betyr bare at ingen terskel er brutt, ikke at tjenesten er frisk.`;
  return alarmer;
}

async function vekkVakt({ tjeneste, rolle = 'primær', melding } = {}) {
  const t = finnTjeneste(tjeneste);
  const hvem = t.vakt[rolle];
  if (!hvem) throw new Error(`Ukjent rolle «${rolle}». Bruk primær eller sekundær.`);
  if (!melding?.trim()) throw new Error('Mangler melding. Si kort hva du har sett og hva du vil at vakta skal gjøre.');

  // Uten et menneske ved tastaturet er det ingen som kan godkjenne, så svaret er nei.
  if (!process.stdin.isTTY) {
    return `Ingen ble vekket: det sitter ikke noe menneske ved tastaturet som kan godkjenne. ` +
      `Ikke prøv andre for samme sak. Skriv i rapporten at ${hvem} bør vekkes, og hvorfor.`;
  }

  console.log(oransje(`\n  📟 Agenten vil vekke ${hvem} (${t.eier_team}, ${rolle}vakt for ${t.navn}):`));
  console.log(`     «${melding}»`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C midt i spørsmålet skal avbryte kjøringen, ikke henge.
  rl.on('SIGINT', () => { rl.close(); process.exit(130); });
  let svar;
  try {
    svar = await rl.question(oransje('     Godkjenn vekking? [j/N] '));
  } finally {
    rl.close();
  }

  if (!/^(j|ja|y|yes)$/i.test(svar.trim())) {
    console.log(grå('     Ingen ble vekket.'));
    return `Mennesket ved tastaturet sa nei. ${hvem} ble ikke vekket. Godta det og ikke prøv andre for samme sak. ` +
      `Skriv i rapporten hva du ville vekket for og hvorfor.`;
  }
  process.stdout.write('\x07');
  console.log(oransje(`     📟 BIIP BIIP 👻 ${hvem} er vekket (simulert, ingen fikk faktisk melding).`));
  return `${hvem} (${t.eier_team}, ${rolle}vakt) er vekket med meldingen «${melding}». Ikke vekk flere for samme sak.`;
}

export const ekstraVerktøy = [
  {
    definisjon: {
      name: 'hent_tjeneste',
      description:
        'Viser hva en tjeneste gjør, hvilket team som eier den, hvem som har vakt (primær og sekundær), ' +
        'hva den er avhengig av (avhengigheter) og hvilke tjenester som rammes hvis den feiler (brukes_av). ' +
        'Bruk den for å følge feilen nedover avhengighetene. Tjenesten som alarmerer er ofte bare den som merker feilen først. ' +
        'Bruk den også før du foreslår hvem som skal vekkes. Utelat tjeneste for å se alle.',
      input_schema: {
        type: 'object',
        properties: { tjeneste: { type: 'string', description: 'Tjenestenavn, f.eks. "kunde-db".' } },
      },
    },
    kjør: async (input) => hentTjeneste(input),
  },
  {
    definisjon: {
      name: 'hent_alarmer',
      description:
        'Viser alle alarmene som har gått i natt, eldst først. Bruk den for å se om alarmen du undersøker kan henge ' +
        'sammen med andre: en felles avhengighet, eller en følgefeil av noe som startet tidligere. ' +
        'At to alarmer kom nær hverandre, er ikke bevis for at de henger sammen. Sjekk i loggene. ' +
        'En tjeneste uten alarm kan fortsatt være årsaken.',
      input_schema: {
        type: 'object',
        properties: { tjeneste: { type: 'string', description: 'Bare alarmer for denne tjenesten. Utelat for alle.' } },
      },
    },
    kjør: async (input) => hentAlarmer(input),
  },
  {
    definisjon: {
      name: 'vekk_vakt',
      description:
        'Vekker vaktpersonen for en tjeneste. Et menneske ved tastaturet må godkjenne hvert kall før noen blir vekket. ' +
        'Bruk den bare når noe er ødelagt for brukerne nå og krever et menneske, ikke for kjent støy eller noe som går over av seg selv. ' +
        'Vekk teamet der feilen sannsynligvis sitter, som ikke alltid er tjenesten som alarmerer. Vekk høyst én person per sak. ' +
        'Meldingen skal være kort: hva du har sett, hva du tror, og hva du vil at personen skal gjøre. ' +
        'Sier mennesket nei, godta det og ta det med i rapporten.',
      input_schema: {
        type: 'object',
        properties: {
          tjeneste: { type: 'string', description: 'Tjenesten der vaktpersonen skal vekkes, f.eks. "betaling".' },
          rolle: { type: 'string', enum: ['primær', 'sekundær'], description: 'Standard primær. Sekundær bare hvis primær ikke svarer.' },
          melding: { type: 'string', description: 'Kort melding til personen som vekkes. Maks et par setninger.' },
        },
        required: ['tjeneste', 'melding'],
      },
    },
    kjør: async (input) => vekkVakt(input),
  },
];
