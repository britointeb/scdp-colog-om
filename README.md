# PAINEL DE GESTÃO DO SCDP DO COLOG OM

Abra **index.html** por duplo clique. Não é necessário iniciar BAT, servidor, Node ou conexão com a internet para consultar o painel já compilado. Mantenha juntos `index.html`, `dados.js` e a pasta `offline/`. A pasta `dist/` também contém uma cópia pronta para abertura direta.

## GitHub e outros computadores

No Windows, abra **PUBLICAR_SCDP.bat** para preparar os programas necessarios e enviar o codigo para [britointeb/scdp-colog-om](https://github.com/britointeb/scdp-colog-om). O mesmo BAT pode baixar e preparar o projeto em outro computador; na primeira execucao, conclua o login do GitHub no navegador. Veja o roteiro completo em [GUIA_GIT.md](GUIA_GIT.md). Cada computador pode configurar sua própria origem em `scdp.local.json`, fora do Git. Depois de instalar as dependências, execute `pnpm run preparar`: ele atualiza as bases disponíveis e gera o index pronto para abertura direta. Sem bases, compila a interface para importar os três CSVs. Não é necessário ter Codex instalado.

## GitHub Pages

O [painel online](https://britointeb.github.io/scdp-colog-om/) é compilado e publicado pelo fluxo `.github/workflows/pages.yml` a cada envio para `main`. Em Settings → Pages, a origem deve ser **GitHub Actions**. O fluxo publica somente `dist/pages`, com o HTML, o JavaScript e o CSS compilados. Publicar diretamente a raiz do código deixa os recursos compilados ausentes.

No site, abra **Carregar dados** para acessar a pasta do Drive e use **Selecionar CSVs** para importar TESGEN, Bilhetes e Teto Orçamentário. Os arquivos são processados no navegador e precisam ser selecionados novamente em outra sessão. O pacote público inicia sem bases reais. Para conferir essa versão localmente, execute `pnpm run build:pages` e abra `dist/pages/index.html`; essa compilação preserva a fotografia e o painel local.

## Cinco páginas

1. **Viagens**: PCDPs, propostos, tipos, situações, transportes, companhias/agências, destaques gerais/nacionais/internacionais, locais, mapa e tabelas percentuais.
2. **Orçamento**: UGR, UG, ação, PI, natureza detalhada, empenhos, vínculos com viagens e conferência dos valores.
3. **Fluxo das PCDPs**: linha do tempo de eventos, solicitações por mês/antecedência, situações dos bilhetes, duração e componentes dos valores.
4. **Ficha da PCDP**: viagem, valores, itinerário alinhado, mapa, bilhetes, componentes Teto, documentos TESGEN relacionados e todos os campos originais.
5. **Ficha do proposto**: todas as PCDPs da pessoa, valores, dias/locais conhecidos, mapas, itinerários e registros de origem.

Os sete KPIs e os filtros são compartilhados entre Viagens, Orçamento e Fluxo. As fichas consultam a base completa e exibem somente seus indicadores próprios. Cada filtro categórico abre uma caixa de seleção múltipla com busca, selecionar todos, desmarcar todos, aplicar e cancelar. Uma seleção vazia significa nenhum registro. Há buscas próprias para observação do documento e qualquer campo bruto, além de datas. As tabelas permitem ordenar, buscar, paginar e exportar CSV.

Os gráficos ficam um abaixo do outro. Cada gráfico oferece PNG, XLSX, CSV e PDF; os arquivos de dados incluem todas as categorias do recorte, mesmo quando o gráfico exibe apenas os maiores valores. O PDF inclui a imagem e a tabela completa. Gráficos de barras permitem alternar para pizza, escolher a medida e consultar a tabela. Os dois gráficos mensais também oferecem barras empilhadas e empilhadas em 100%; a linha do tempo usa bolhas com a contagem de eventos. Rótulos mostram os valores, com detalhes adicionais no cursor.

Nomes de propostos e identificadores de PCDP nas tabelas e fichas abrem as respectivas fichas. Os links preservam UG, ano e complemento e podem ser copiados para abrir diretamente uma ficha no mesmo painel.

## Atualizar as bases

A abertura direta usa a fotografia local incluída em `dados.js`. O navegador não pode ler automaticamente as pastas de origem. O botão **Carregar dados** abre a [pasta de bases no Google Drive](https://drive.google.com/drive/folders/1aeeQPivSldOhN-XXX_DO4-jr6ZOZ0syh?usp=drive_link) em uma nova aba. O link não importa automaticamente os arquivos no navegador. A opção de selecionar os três CSVs continua disponível na recuperação de uma base ausente ou inválida e altera somente a sessão atual.

Para atualizar a fotografia persistente, dentro desta pasta:

```powershell
node scripts/atualizar_dados.mjs
```

O atualizador procura um CSV em cada pasta `SCDP/DADOS/SAIDA/TESGEN`, `BILHETES` e `TETO_ORCAMENTARIO`; valida estrutura, registra SHA-256, copia para `public/dados/` e regenera `dados.js`, inclusive na cópia `dist/` existente. Feche/reabra ou recarregue o index depois disso. Os arquivos de origem são apenas lidos.

Para indicar outra instalação:

```powershell
node scripts/atualizar_dados.mjs --source "C:\caminho\SCDP\DADOS\SAIDA"
```

A ordem de escolha é caminho explícito `--source`, variável `SCDP_SOURCE`, configuração `scdp.local.json` e `../DADOS/SAIDA`. Caminhos relativos no arquivo local são resolvidos a partir da pasta do projeto. Atualizar dados requer Node e a dependência PapaParse instalada; consultar o index compilado não requer esses programas.

## Regras dos valores

- **Escopo TESGEN**: união dos empenhos de Bilhetes e Teto, preservando UG/ano. Provisão e dotação sem NE entram pelas naturezas relacionadas. Elementos com subitem `-9` são identificados como agregados, sem rateio entre subelementos.
- **Liquidado**: exercício + RAP processados liquidados + RAP não processados liquidados. Na fonte atual falta a coluna dos processados liquidados; o painel informa a limitação e soma as parcelas disponíveis.
- **Pago**: exercício + RAP processados pagos + RAP não processados pagos.
- **Disponível**: saldo explícito da fonte, quando existir. Na fonte atual é calculado como provisão menos empenhado e identificado como cálculo derivado.
- **Bloqueado**: medidas de bloqueio existentes. Campos integralmente vazios aparecem como indisponíveis, não como zero.
- **Cancelado**: cancelamentos do exercício e total agregado RAP, sem somar novamente os subtotais já incluídos no agregado.
- **Conferência por liquidação**: empenhado = liquidado + a liquidar + bloqueado + cancelado.
- **Conferência por pagamento**: empenhado = pago + a pagar + bloqueado + cancelado. Bloqueado entra uma única vez em cada equação.
- **A liquidar / A pagar**: usa o saldo próprio da fonte quando disponível. Sem esse campo, calcula o residual da respectiva equação, identificado como calculado. Se faltarem parcelas, mostra saldo calculado parcial usando apenas os valores conhecidos. Um saldo calculado não constitui conferência independente; diferença e conciliação só são avaliadas com saldo de origem e parcelas completas.
- **Valor geral da PCDP**: realizado + em andamento do Teto, por componente, usando a última cobertura. Sem Teto, usa o total de referência da PCDP em Bilhetes. Totais repetidos no histórico não são somados novamente.
- **Tarifa/embarque/serviço**: último registro de cada bilhete. A emitir/emitido/a devolver: totais de referência da PCDP, apresentados em séries separadas. Esses grupos não devem ser somados entre si como um único total.
- **Natureza dos componentes Teto**: classificação somente quando existe uma única natureza para o empenho. Empenhos com múltiplas naturezas permanecem identificados. A falta de diárias ou outro componente na fonte não é preenchida com valores estimados.
- **Viajante e favorecido**: nomes de propostos são normalizados; homônimos não são resolvidos automaticamente. Favorecido contábil não é usado como viajante. Valores integrais de empenhos compartilhados são contexto institucional.

## Cobertura e datas

Teto tem cobertura do relatório, não data de movimento. Datas globais filtram emissão TESGEN e início da viagem de Bilhetes, mantendo a cobertura Teto. A antecedência usa início menos solicitação; duração usa fim menos início.

As faixas mensais são exclusivas: até 15, de 16 a 30, acima de 30 dias e sem antecedência. O arquivo não traz uma data autônoma de criação da PCDP; usa-se `data_solicitacao`. A linha do tempo mostra eventos datados, agrupados pela situação conhecida; ela não inventa transições da situação PCDP. Datas de emissão de NE ausentes não são substituídas pela primeira movimentação.

Períodos, trechos, meios e companhias concatenados são separados por posição quando o conteúdo permite confirmar a associação. Conteúdo truncado ou ambíguo permanece na tabela para conferência. Mapas funcionam offline com geografia Natural Earth e catálogo GeoNames; destinos fora do catálogo permanecem sem coordenadas. Valores por cidade são valores das PCDPs relacionadas e não são aditivos entre cidades. Dias/locais desconhecidos não entram nos rankings dessas medidas.

## Desenvolvimento e verificação

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm run preparar
pnpm test
pnpm run dev
```

`preparar` atualiza as bases da origem configurada quando ela existe e executa a compilação. `build` compila as bases locais existentes ou uma interface vazia para importação. A compilação gera um script clássico IIFE e CSS em `offline/`, sem módulos, fetch ou workers na abertura direta. `dev` abre `/dev.html`. Os scripts de servidor/BAT antigos continuam disponíveis para compatibilidade, mas não são necessários para a consulta. Para gerar novamente o catálogo geográfico, consulte `geografia/LEIA_ME.md`.

O `.gitignore` exclui bases reais, fotografia, dependências, relatórios, backups, configuração local e compilação. O projeto usa Node.js 22.13 ou superior e pnpm 11.25.0; foi validado com Node 24. `dados.js` contém dados reais das fontes e deve permanecer junto ao painel local. Licenças das bibliotecas em `THIRD_PARTY_NOTICES.md`; referências geográficas em `geografia/LEIA_ME.md`.

## Tema visual

Fundo branco com faixas amarelas, títulos vermelhos e azuis e textos em azul escuro/cinza, seguindo as cores da referência fornecida. Gráficos mantêm séries coloridas. O menu lateral cinza pode ser recolhido e expandido. O brasão do COLOG está em `assets/colog.png`; mantenha esse arquivo no repositório para recompilar o painel. O rodapé identifica: Produzido por Cel BRITO.
