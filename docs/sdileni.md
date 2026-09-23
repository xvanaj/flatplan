# Sdílení plánu bez přihlášení

Web zůstává na GitHub Pages. Plán je v Supabase a přístup k němu poskytuje náhodný 256bitový klíč ve fragmentu odkazu (`#overview&plan=…`). Klíč neopouští fragment při navigaci; aplikace jej posílá pouze v těle požadavku do databázových funkcí. Databáze ukládá jen SHA-256 otisk klíče. Veřejný API klíč sám neposkytuje přístup k plánům ani jejich seznamu.

## Jednorázová aktivace

V tomto repozitáři už je veřejná konfigurace projektu `ortpkeyxpgkrnbnlqfoj` v `public/cloud-config.js`. Nasazení ji použije automaticky. Proměnné v kroku 4 jsou potřeba jen pro přesměrování na jiný projekt; pokud nejsou vyplněné, konfigurace ze souboru zůstane zachovaná.

1. Vytvoř projekt na https://supabase.com/dashboard (nebo použij vlastní existující projekt).
2. V **SQL Editor → New query** vlož celý soubor `supabase/setup.sql` a spusť jej. Nepřidávej veřejné SELECT/UPDATE policies: aplikace přistupuje přes dvě funkce, tabulka zůstává nepřístupná.
3. Z dialogu **Connect** / nastavení API zkopíruj Project URL a veřejný **publishable** klíč (případně starší **anon**). Nepoužívej `service_role` ani `sb_secret_`.
4. V GitHub repozitáři otevři **Settings → Secrets and variables → Actions → Variables** a přidej:
   - `FLATPLAN_SUPABASE_URL`: například `https://PROJECT.supabase.co` (bez lomítka na konci).
   - `FLATPLAN_SUPABASE_KEY`: veřejný klíč z předchozího kroku.
5. Pushni změny a spusť **Actions → Deploy Flatplan to GitHub Pages → Run workflow**.
6. Na zařízení a v prohlížeči, kde máš dosavadní změny, otevři původní adresu aplikace. Klikni **Sdílet plán**. Tím se aktuální místní plán přenese online. Zkopíruj vytvořený odkaz a ulož si ho také pro sebe.
7. Otevři odkaz na druhém zařízení. Uprav položku a ověř, že se do několika sekund objeví i na prvním zařízení. Otevřený editor automatické načítání pozastaví až do zavření formuláře.

Bez proměnných aplikace nadále funguje lokálně; netvrdí, že ukládá online. Samotný deploy nic nepřenáší z localStorage. Původní místní plán zůstává zachovaný na adrese bez sdílecího klíče.

## Chování sdíleného plánu

- Změny se ukládají automaticky. Aktualizace ostatních se kontrolují každé 4 sekundy, při návratu do okna a po obnovení spojení.
- Při výpadku spojení se změny uchovají v prohlížeči a odešlou po obnovení připojení; status rozlišuje čekající změny od online uložení. Již navštívený plán má místní kopii. Samotná aplikace nemá offline instalaci: při úplném výpadku nemusí jít nově otevřít web.
- Úpravy různých polí se sloučí. Při změně stejného pole (včetně smazání upravené položky) uživatel vybere svoje nebo online hodnoty. Výběr platí jen pro konflikty, ostatní změny se zachovají. Svoji verzi lze před rozhodnutím stáhnout.
- Zápis v databázi kontroluje číslo revize atomicky. Zastaralý zápis neprojde a klient načte novou verzi.
- Každý držitel odkazu má stejná editační práva, včetně odstranění položek a obnovy zálohy. Bez odkazu nejsou plány vyhledatelné. Sdílecí odkaz neukládej do veřejného repozitáře.
- Zálohy JSON jsou dál dostupné. Obnova zálohy ve sdíleném plánu se synchronizuje ostatním.

## Lokální konfigurace

V PowerShellu nastav veřejné hodnoty a spusť generátor:

```powershell
$env:FLATPLAN_SUPABASE_URL='https://PROJECT.supabase.co'
$env:FLATPLAN_SUPABASE_KEY='sb_publishable_…'
node scripts/configure-cloud.mjs
npm start
```

Soubor `public/cloud-config.js` obsahuje pouze veřejnou konfiguraci. SQL nevyžaduje Supabase Auth, Realtime ani další rozšíření. Funkce používají `security definer`, prázdný `search_path` a explicitně omezená oprávnění. Vlastník Supabase projektu může plán odstranit v tabulce `flatplan_private.plans`; aplikace zatím nemá rotaci odkazu ani historii verzí. Vytváření plánů je bez účtu, tedy také veřejné; sleduj využití projektu a jeho kvóty.

Dokumentace: [Databázové funkce](https://supabase.com/docs/guides/database/functions), [Veřejné API klíče](https://supabase.com/docs/guides/api/api-keys).
