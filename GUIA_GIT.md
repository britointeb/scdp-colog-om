# GitHub e uso em vários computadores

O Git sincroniza o código. As bases reais, fotografias, backups, dependências e a configuração de cada máquina permanecem fora do repositório. O botão **Carregar dados** abre a pasta do Drive; não baixa ou importa os arquivos automaticamente.

## Publicar com um unico BAT no Windows

Use **PUBLICAR_SCDP.bat**. O arquivo ja aponta para https://github.com/britointeb/scdp-colog-om e configura o autor local como britointeb <britointeb@gmail.com>.

No primeiro computador, deixe o BAT dentro da pasta DASH_SCDP, junto de app.jsx e package.json, e abra-o por duplo clique. Ele verifica Git, GitHub CLI, Node.js e pnpm; reaproveita versoes compativeis ou prepara ferramentas portateis na pasta do usuario, conferindo os hashes dos downloads oficiais. Nao requer WinGet, Codex ou instalacao global como administrador.

Na primeira execucao, conclua o login da conta britointeb no navegador usando o codigo mostrado pelo GitHub CLI. Depois o BAT instala as dependencias do projeto, executa os testes, prepara o painel, cria o commit e envia para main. Versoes remotas sao conciliadas sem push forcado. Conflitos ou dados ja incluidos no indice/historico interrompem o envio e preservam os arquivos locais.

Depois do primeiro envio, voce pode levar somente esse mesmo BAT para outro computador. Fora da pasta do painel, ele clona o repositorio para uma subpasta scdp-colog-om e prepara o projeto. Se estiver na propria pasta do painel, reutiliza essa instalacao. Os caminhos das bases podem continuar diferentes por computador, usando scdp.local.json conforme explicado abaixo.

Requer Windows 10/11 de 64 bits (x64 ou ARM64), internet e autorizacao para executar programas no computador. Ferramentas preparadas pelo BAT ficam em %LOCALAPPDATA%/SCDP-Tools. O envio inclui somente os arquivos reconhecidos do codigo; bases, fotografias, configuracoes locais, dependencias e backups ficam fora. O BAT nao altera o limite de acesso do repositorio.

Os comandos manuais abaixo continuam disponiveis como referencia.

## Primeiro envio

Instale Git e Node.js LTS (22.13 ou superior; o painel foi validado com Node 24). Instale o gerenciador usado pelo projeto:

```powershell
npm install -g pnpm@11.25.0
```

No GitHub, crie um repositório vazio, sem adicionar README, licença ou .gitignore, pois esses arquivos já pertencem ao projeto. Use privado se quiser restringir o acesso ao código. Copie a URL HTTPS do novo repositório.

No terminal aberto dentro da pasta do dashboard:

```powershell
git init -b main
git config user.name "britointeb"
git config user.email "britointeb@gmail.com"
git add .
git status --short
git diff --cached --stat
```

Confira os nomes dos arquivos preparados. Não devem aparecer dados.js, bases de public/dados, backups, dist, offline, node_modules ou scdp.local.json. Os arquivos scdp.local.example.json e public/dados/.gitkeep devem aparecer.

Substitua os marcadores abaixo pelo usuário e pelo nome reais do repositório:

```powershell
git commit -m "Adiciona dashboard SCDP"
git remote add origin https://github.com/britointeb/scdp-colog-om.git
git push -u origin main
```

Conclua a autenticação solicitada pelo Git/GitHub. Não coloque senhas ou tokens nos comandos. O roteiro presume repositório remoto vazio; se ele já tiver commits, use uma cópia clonada e transfira o código para ela, preservando seu histórico.

## Primeiro uso em outro computador

Instale Git, Node.js LTS e pnpm 11.25.0. No terminal, escolha onde guardar o código e execute:

```powershell
git clone https://github.com/britointeb/scdp-colog-om.git DASH_SCDP
cd DASH_SCDP
pnpm install --frozen-lockfile --ignore-scripts
```

O projeto não exige o mesmo usuário do Windows, letra de unidade ou nome da pasta em todos os computadores. Se o painel estiver ao lado de DADOS/SAIDA, a origem é encontrada pela posição das pastas:

```text
SCDP/
├── DASH_SCDP/
└── DADOS/
    └── SAIDA/
        ├── TESGEN/             um CSV
        ├── BILHETES/           um CSV
        └── TETO_ORCAMENTARIO/  um CSV
```

Quando as bases estiverem em outro lugar, faça uma cópia local do modelo:

```powershell
Copy-Item scdp.local.example.json scdp.local.json
```

Edite apenas scdp.local.json. Exemplo no Windows:

```json
{
  "source": "E:/GoogleDrive/PROGRAMACAO/NOTEBOOKS/SCDP/DADOS/SAIDA"
}
```

O caminho pode ser absoluto ou relativo à pasta do projeto. Este arquivo fica fora do Git, portanto cada computador pode ter um caminho diferente. A precedência é: --source, variável SCDP_SOURCE, scdp.local.json e ../DADOS/SAIDA.

Depois execute:

```powershell
pnpm run preparar
```

O comando atualiza as bases quando a origem existe e compila o painel. Em seguida abra index.html por duplo clique. Sem uma origem disponível nem bases locais, a interface é preparada vazia; use **Selecionar CSVs** para importar os três arquivos. Essa importação é válida apenas na sessão. Para uma fotografia persistente, configure a origem e rode preparar novamente.

O primeiro preparo precisa de internet para instalar dependências. A consulta do index compilado funciona localmente, sem servidor e sem precisar de Node em execução. Não é necessário ter Codex instalado.

## Dia a dia

Antes de começar a editar em um computador:

```powershell
git pull --ff-only
pnpm install --frozen-lockfile --ignore-scripts
pnpm run preparar
```

Depois de alterar o código:

```powershell
git add .
git diff --cached --stat
git commit -m "Descreve a alteração feita"
git push
```

Finalize e envie alterações antes de mudar de computador. Se pull avisar que há alterações locais ou históricos divergentes, confira e resolva os arquivos envolvidos antes de continuar. Para atualização somente das bases, execute pnpm run update-data; não é preciso fazer commit nem recompilar o código.

## Site no GitHub Pages

O envio para `main` também aciona a compilação e a publicação do [site](https://britointeb.github.io/scdp-colog-om/). Acompanhe o fluxo **Publicar painel no GitHub Pages** na aba Actions. A configuração Settings → Pages deve usar **GitHub Actions** como origem. O fluxo gera `dist/pages` e publica esse pacote, incluindo os recursos compilados que ficam fora do Git.

O site abre com a opção **Selecionar CSVs**. Baixe os três arquivos pela pasta do Drive aberta em **Carregar dados** e selecione-os no navegador. A importação vale para a sessão atual. As bases reais e a fotografia local não são publicadas.

## Referências

- [Enviar código local ao GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [Instalar pnpm](https://pnpm.io/installation)
- [Download do Node.js](https://nodejs.org/en/download)
