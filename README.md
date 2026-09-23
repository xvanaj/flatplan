# Flatplan

Osobní plán rekonstrukce podle `docs/Rekonstrukce - plan.docx`. Osm místností, práce, materiály s odkazy, rozpočet, rozhodnutí a původní obrazové podklady. Česká responzivní webová aplikace bez instalace balíčků a placených služeb.

## Spuštění

Potřebuje Node.js 20 nebo novější. V kořeni projektu spusť `npm start` a otevři http://localhost:4180. Testy: `npm test`.

Jiný port lze nastavit v PowerShellu: `$env:PORT=4181; npm start`. Pokud je port obsazený, server vypíše srozumitelnou zprávu. Při změně portu se uložená data prohlížeče nepřenesou automaticky: na původní adrese stáhni zálohu a na nové ji obnov.

## Používání

- V místnosti uprav práci tužkou: cenu, stav, prioritu, kdo ji udělá a poznámku. Další práce lze přidávat.
- U materiálu ulož odkaz, jednotkovou cenu a množství. Alternativy ve stavu „Tip k porovnání“ se nezapočítávají. Vybrané a koupené položky ano, každá jednou.
- Cena práce je celková cena této položky. Materiál zahrnutý v nabídce nepřidávej znovu do rozpočtu. U návazností předsíně a komory je potřeba nacenit společné podlahy jen jednou.
- Ceny jsou záměrně prázdné, dokud je nedoplníš. Částka nahoře není odhad ceny celé rekonstrukce. Rezerva je standardně nastavená na upravitelných 15 %.
- Data se ukládají do localStorage tohoto prohlížeče na této adrese. Nesynchronizují se mezi zařízeními. Vymazání dat prohlížeče může plán smazat; používej „Stáhnout zálohu“. Zálohu JSON lze obnovit v jiném prohlížeči. Obnova nahrazuje aktuální data až po potvrzení.

## Rozsah a doporučené pořadí

1. Potvrdit s projektantem proveditelnost a postup vůči úřadu a SVJ, řešení požáru, odpadu a odvětrání. Zachování jedné katastrální jednotky není podkladem pro závěr o povolení úprav.
2. Poptat rozvody a práce po místnostech. Potvrdit podklad pod podlahy, provedení sprchy, dveře a měření energií.
3. Porovnat nabídky včetně DPH, dopravy, přípravy podkladů, zapravení a odvozu odpadu. Oddělit materiál, práci a vlastní práci.
4. Zachovat podle stavu ohřívač, obklady ze sklepa a použitelné části kuchyně. Atypickou sprchu a variantu dvou kotlů nacenit samostatně.
5. Až po potvrzení rozměrů a instalací vybrat a objednat materiály.

Rozdělení místností na levou a pravou část vychází z návrhu půdorysu, není to právní označení bytových jednotek. Dvě zbývající obytné místnosti nemají v textu dokumentu specifikované práce, proto nevytváříme smyšlené úkoly. Nové úkoly k provedení koupelny jsou rozepsané také z poznámek projektového výkresu. Volba svépomoci je ponechána k potvrzení, neodvozuje se automaticky z barev původního Wordu.

Podklady v `public/assets` jsou vytažené z dokumentu včetně projektového razítka. Lokální server poslouchá jen na tomto počítači. Po nasazení na GitHub Pages budou obrázky součástí webu včetně údajů ve výkresech. Původní Java/Gradle projekt zůstal beze změn. Volitelný Google Font má systémový fallback, aplikace funguje i bez jeho stažení.

## Nasazení na GitHub Pages

Web je statický; na GitHub Pages nepotřebuje Node server. Relativní cesty podporují i adresu `https://uzivatel.github.io/flatplan/`.

1. Pushni projekt do GitHub repozitáře na jeho výchozí větev.
2. V repozitáři otevři **Settings → Pages → Source → GitHub Actions**.
3. V **Actions → Deploy Flatplan to GitHub Pages → Run workflow** spusť nasazení. Workflow nejprve ověří aplikaci a potom publikuje pouze složku `public`. Adresa webu se objeví u dokončeného deploymentu.
4. Při další aktualizaci pushni změny a znovu spusť workflow.

Nasazení je úmyslně ruční: samotný push web nezveřejní. Publikované výkresy a fotografie nemají v aplikaci ochranu přihlášením. Soubor Word a ostatní soubory mimo `public` se nenahrávají do Pages, ale mohou být dostupné v repozitáři podle jeho viditelnosti.

Vlastní práce, ceny a poznámky zůstávají v localStorage návštěvníkova prohlížeče, neukládají se do GitHubu. Pro přenos z localhostu na GitHub Pages použij export a import zálohy.

Postup vychází z [dokumentace GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
