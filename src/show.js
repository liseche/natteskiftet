// Litt Halloween til demoen: banner ved start, skillelinjer mellom alarmer og
// rapporten lest høyt med den norske macOS-stemmen Nora.
import { spawn } from 'node:child_process';

const oransje = (t) => `\x1b[38;5;208m${t}\x1b[0m`;
const grå = (t) => `\x1b[90m${t}\x1b[0m`;

export function banner() {
  console.log(oransje(`
   🌕                                              🦇
         N   A   T   T   E   S   K   I   F   T   E   T      🐺
                                       🦇
   ────────────────────────────────────────────────────────────`));
  console.log(grå('   første vakt når alarmen går kl 03 · auuuuuuu …'));
}

export function overskrift(tekst) {
  console.log(oransje(`\n\n👻 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ${tekst}`));
}

// Fjerner markdown og kutter etter noen setninger, så opplesningen tar sekunder og ikke minutter.
export function tilTale(rapport, maks = 400) {
  const ren = rapport
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/([^.!?:\s])[ \t]*\n+/g, '$1. ')
    .replace(/\s+/g, ' ')
    .trim();
  let tale = '';
  for (const setning of ren.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []) {
    if (tale && (tale + setning).length > maks) break;
    tale += setning;
  }
  return tale.trim();
}

// Gjør ingenting utenfor macOS. Feil fra say svelges, demoen skal ikke stoppe av lyd.
export async function lesOpp(rapport) {
  if (process.platform !== 'darwin' || !rapport?.trim()) return;
  console.log(grå('\n🔊 Leser opp … (Ctrl+C stopper, --stille slår av)'));
  await new Promise((ferdig) => {
    const say = spawn('say', ['-v', 'Nora', `Natteskiftet melder. ${tilTale(rapport)}`], { stdio: 'ignore' });
    say.on('error', ferdig);
    say.on('close', ferdig);
  });
}
