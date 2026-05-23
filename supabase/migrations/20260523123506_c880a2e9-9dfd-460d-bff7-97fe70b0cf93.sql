
-- Backfill search_queries for every enabled board with strong, multilingual blue-collar terms
UPDATE source_boards SET search_queries = ARRAY[
  'radnik','vozač','varilac','građevina','skladište','električar','vodoinstalater','čistač','konobar','kuvar'
] WHERE country_iso2='RS' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'radnik','vozač','varilac','građevina','skladište','električar','vodoinstalater','čistač','konobar','kuvar'
] WHERE country_iso2 IN ('HR','BA','ME') AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'delavec','voznik','varilec','gradbeništvo','skladišče','električar','vodovodar','čistilec','kuhar'
] WHERE country_iso2='SI' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'muncitor','șofer','sudor','construcții','depozit','electrician','instalator','curățenie','bucătar','ospătar'
] WHERE country_iso2='RO' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'munkás','sofőr','hegesztő','építőipar','raktár','villanyszerelő','vízvezeték','takarító','szakács','pincér'
] WHERE country_iso2='HU' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'работник','шофьор','заварчик','строителен','склад','електротехник','водопроводчик','чистач','готвач'
] WHERE country_iso2='BG' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'pracownik','spawacz','kierowca','magazyn','budownictwo','elektryk','hydraulik','sprzątacz','kucharz','kelner'
] WHERE country_iso2='PL' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'pracovník','zvárač','vodič','sklad','stavebníctvo','elektrikár','inštalatér','upratovač','kuchár','čašník'
] WHERE country_iso2='SK' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'dělník','svářeč','řidič','sklad','stavebnictví','elektrikář','instalatér','uklízeč','kuchař','číšník'
] WHERE country_iso2='CZ' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'bauarbeiter','schweißer','lkw-fahrer','lager','elektriker','klempner','reinigungskraft','koch','kellner','pflegekraft'
] WHERE country_iso2 IN ('AT','DE') AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'εργάτης','οδηγός','συγκολλητής','αποθήκη','οικοδομή','ηλεκτρολόγος','υδραυλικός','καθαριότητα','μάγειρας','σερβιτόρος'
] WHERE country_iso2 IN ('GR','CY') AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'operaio','autista','saldatore','magazzino','edilizia','elettricista','idraulico','pulizie','cuoco','cameriere'
] WHERE country_iso2='IT' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'obrero','conductor','soldador','almacén','construcción','electricista','fontanero','limpieza','cocinero','camarero'
] WHERE country_iso2='ES' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'operário','motorista','soldador','armazém','construção','eletricista','canalizador','limpeza','cozinheiro','empregado'
] WHERE country_iso2='PT' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'magazijn','chauffeur','lasser','bouw','elektricien','loodgieter','schoonmaak','kok','horeca','zorgmedewerker'
] WHERE country_iso2='NL' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'punëtor','shofer','saldator','ndërtim','magazinë','elektricist','pastrim','kuzhinier'
] WHERE country_iso2='AL' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

UPDATE source_boards SET search_queries = ARRAY[
  'работник','возач','заварувач','градежен','магацин','електричар','водоинсталатер','готвач'
] WHERE country_iso2='MK' AND (search_queries IS NULL OR array_length(search_queries,1) IS NULL OR array_length(search_queries,1) < 6);

-- Bump default cap so single runs can yield more
UPDATE source_boards SET daily_cap = GREATEST(daily_cap, 150);
