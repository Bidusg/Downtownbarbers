# Automatiske tester (Playwright)

Testene går gjennom nettsiden som en kunde: forsiden, NO/EN, mobilmenyen,
bookingen (helt til «Fullfør», men sender aldri inn), Min side,
avbestilling, avmelding og innlogging – på mobil, iPad og PC.

## Første gang

```
npm install
npx playwright install chromium
```

## Kjøre

| Hva | Kommando |
| --- | --- |
| Mot din lokale versjon (kjør `npm run build` først) | `npm run test:e2e` |
| Mot den ekte nettsiden (kun lesing, lager ingen bookinger) | `npm run test:e2e:prod` |
| Se rapporten med skjermbilder | `npx playwright show-report` |

Feiler en test, ligger skjermbilde og opptak av hva som skjedde i rapporten.
