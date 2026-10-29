# Geografia local

O painel inclui `mundo.json` e `cidades.json`, utilizados sem chamadas de rede. Coordenadas indicam centros de cidades, não endereços de pessoas.

- Limites: [Natural Earth, escala 1:110 milhões](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/), domínio público. Origem: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson`.
- Cidades: [GeoNames](https://www.geonames.org/export/), atribuição conforme [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Origem: `https://download.geonames.org/export/dump/cities15000.zip`. Cada cidade inclui o identificador GeoNames; ambiguidades de Richmond e Washington foram resolvidas por país/estado.

Para regenerar, baixe as fontes acima como `geografia/mundo.geojson` e `geografia/cities15000.zip`, extraia `cities15000.txt` na mesma pasta e execute `node scripts/gerar_geografia.mjs`. Novos destinos devem ser adicionados ao catálogo com país e, se necessário, estado; depois recompile o painel.

Os nomes de cidades são reconhecidos no conteúdo de `trechos`. Texto truncado não é corrigido por aproximação; ele permanece assinalado na tabela do itinerário.
