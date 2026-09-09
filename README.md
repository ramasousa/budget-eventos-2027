# Orçamento de Viagens 2027

Planejamento orçamentário de viagem para 2027 — eventos internacionais de
tecnologia e a visita de rotina aos polos nacionais —
**Open Platform & BaaS, BU AI First · Banco Bradesco**.

Página única, colaborativa e publicada no GitHub Pages: qualquer pessoa com o
link vê o mesmo orçamento consolidado, em tempo real, sem instalar nada.

Interface no **Design System Velo.ai**. **Zero dependências externas** — nada
de CDN, fontes remotas ou servidor de mapas: tudo é servido pelo próprio
repositório, o que importa numa rede corporativa que bloqueia domínios de
terceiros.

---

## As duas páginas

| | |
|---|---|
| **`index.html`** — a capa | O que abre quando alguém recebe o link. Mostra o total do plano ao vivo, o quanto do limite está comprometido, quem alterou por último e o que há dentro. Fundo é o próprio mundo em matriz de pontos, com as praças do plano acesas — geometria de verdade, não foto de banco de imagens. |
| **`app.html`** — a ferramenta | O orçamento em si, nas quatro abas. |

A capa não carrega Leaflet nem a base de cidades: abre instantânea. O ponto
vermelho da marca, dentro da ferramenta, volta para ela.

Os dois números vêm da **mesma fórmula** (`assets/js/custo.js`). Se ela vivesse
em dois lugares, um dia a capa e a ferramenta mostrariam totais diferentes e
ninguém perceberia até a reunião — há um teste que compara os dois.

## O que a ferramenta faz

| Aba | Para quê |
|---|---|
| **Catálogo** | 24 eventos com custo aberto por pessoa, benefício estratégico, perfil de quem deve ir e resultado esperado. Selecione, defina participantes e **inclua eventos que faltam**. |
| **Viagens nacionais** | A política de visita aos polos (Recife, Curitiba): quantas pessoas em cada cargo, quantas vezes por ano em cada escritório, a que custo. |
| **Mapa de calor** | Onde o ecossistema se concentra (*Mercado*) versus onde estamos indo e quanto custa cada praça (*Nosso plano*). |
| **Calendário 2027** | Distribuição no ano, custo por mês e alerta de concentração de ausências. |
| **Consolidado** | Visão de apresentação: KPIs, composição de custo, internacional × nacional, distribuição geográfica e por trimestre, detalhamento e premissas. |

O painel de orçamento à direita acompanha todas as abas: total do ano aberto
em **internacional e nacional**, limite, percentual comprometido e saldo.

### Modelo de custo

Por pessoa, por evento — o mesmo formato do estudo original:

```
passagem + inscrição + (hotel × noites) + (diária × dias) + traslado
```

Passagens e hospedagem estão em BRL. Inscrições ficam na moeda de origem
(USD/EUR/GBP) e são convertidas pelo câmbio definido em **Premissas**.

Não inclui visto, seguro-viagem nem excesso de bagagem.

### Ingressos de cortesia

Boa parte dos ingressos costuma vir dos fornecedores. Cada evento selecionado
tem o controle **Ingresso cortesia**, que zera a inscrição das pessoas
cobertas — passagem, hospedagem, diárias e traslado continuam valendo.

É uma **quantidade**, não um sim/não: conseguir 2 passes para uma equipe de 4
é o caso comum, e um booleano subestimaria o orçamento. O botão liga cobrindo
todo mundo; o stepper ao lado ajusta para cobertura parcial.

A economia aparece no card, no painel lateral, num KPI próprio do consolidado
e nas duas exportações.

### Viagens nacionais: uma política, não uma lista

Recife e Curitiba são escritórios visitados por rotina. Isso não é decisão
caso a caso como um evento internacional — é uma **regra**, e a aba
*Viagens nacionais* edita a regra:

```
total = Σ_polo Σ_cargo (pessoas × viagens/ano no polo) × custo do polo
```

A tela tem duas partes. Os **polos** (nome, custo fechado por viagem) e uma
**matriz cargo × polo** com quantas pessoas há em cada cargo e quantas vezes
por ano cada uma vai a cada escritório. Mudou o time ou a cadência, muda um
número e o orçamento acompanha.

O padrão que veio da planilha: Gerente Sênior 4× por ano a cada polo, Gerente
2×, a R$ 2.000 a viagem. Com 1 sênior e 2 gerentes, dá **R$ 32.000/ano**.

Poderia ter sido uma lista de "pessoa × destino", copiando a planilha. Seria
pior: cada admissão ou promoção viraria retrabalho manual de trinta linhas, e
o número deixaria de ter regra visível para o superintendente questionar. Aqui
a pergunta "por que R$ 32 mil?" tem resposta na tela.

Polo novo entra pela busca de cidades — a coordenada vem junto e ele aparece
no mapa na hora, com linguagem visual própria (verde tracejado). Fica **fora**
da camada de calor de propósito: o calor mede concentração de eventos
internacionais, e misturar a visita de rotina distorceria a leitura.

Cadência de polo novo nasce **zerada**. Ninguém viaja por acidente de cadastro.

#### O que isso mudou no número da capa

Antes, a manchete era o orçamento de eventos internacionais. Agora é o
**orçamento de viagem inteiro**, e o limite definido é comparado contra ele.
O painel lateral, o consolidado e as duas exportações abrem a composição —
internacional e nacional separados, somando no total.

Vale conferir se os R$ 300.000 do limite foram definidos pensando só nos
eventos ou na viagem toda. Se for só nos eventos, o limite precisa subir.

### Adicionar um evento que não está na lista

O catálogo é um ponto de partida, não uma camisa de força. **+ Adicionar
evento** abre um formulário que pede o mesmo que os eventos curados têm:
custo aberto, benefício estratégico, quem deve ir e resultado esperado — a
disciplina que sustenta a conversa com a diretoria vale para o que o time
inclui também.

A cidade é escolhida numa lista de 3.700 praças que já traz país, região e
coordenada — ninguém precisa digitar latitude. A busca ignora acentos e
aceita o nome em português ou no original ("Munique" ou "Munich"). Se a sede
ainda não foi anunciada, há a opção *sede não definida*: o evento entra no
orçamento e no calendário, e fica de fora do mapa.

O custo por pessoa é calculado enquanto você digita, com o câmbio das
Premissas. Ao salvar, o evento vale para todos e se comporta como qualquer
outro — mapa, calendário, consolidado e exportações.

Eventos incluídos pela equipe ficam marcados e podem ser removidos. Os 24
curados não têm botão de remover, para ninguém apagar o catálogo por engano.

### Cenários e histórico

**Salvar cenário** guarda uma fotografia do orçamento: quais eventos, quantas
pessoas, quantas cortesias, qual limite e qual câmbio. Serve para comparar
alternativas — "plano cheio" contra "plano enxuto" — sem perder nenhuma das
duas.

Em **Cenários** ficam os salvos. *Carregar* substitui o plano compartilhado
atual pelo do cenário, para todos. O **✕** exclui a fotografia; o orçamento em
uso não é tocado.

Abaixo, o **histórico automático**: o banco guarda o estado do plano sozinho,
sempre antes de qualquer exclusão e a cada 10 minutos de uso. É a rede de
segurança contra apagamento acidental — ou malicioso. Restaurar também gera um
ponto de retorno, então nada ali é irreversível.

### Confiança das datas

Datas e sedes de 2027 nem sempre são oficiais. Cada evento carrega um selo:

- **Data estimada** — baseada no calendário histórico do evento.
- **Sede/data a confirmar** — o organizador ainda não divulgou.

Revalidar na abertura das inscrições.

---

## Como funciona a persistência

Supabase (projeto `mcp-bradesco-plano`, região `sa-east-1`), quatro tabelas
com prefixo `eventos2027_`:

| Tabela | Papel |
|---|---|
| `eventos2027_events` | Catálogo. Editar custo de um evento = editar a linha aqui. A coluna `custom` marca o que a equipe incluiu pela página. |
| `eventos2027_plan` | **Plano vigente compartilhado** (evento, participantes, cortesias). É o que todos veem ao abrir. |
| `eventos2027_settings` | Limite de orçamento e câmbio (linha única). |
| `eventos2027_scenarios` | Cenários salvos — fotografias nomeadas para comparação. |

Estratégia do cliente: **escrita otimista + polling**. Toda alteração aparece
na hora na tela de quem editou e é gravada logo em seguida; a cada 12 segundos
a página busca o estado remoto, então a alteração de um colega aparece sozinha
na tela dos demais. Uma edição local recente tem precedência por 4 segundos,
para o número não "pular" enquanto alguém digita.

### Se algo cair

A página foi construída para degradar sem quebrar:

- **Supabase inacessível** → assume o espelho em `localStorage` e, se não
  houver, o catálogo embarcado em `assets/js/data.js`. O indicador fica
  vermelho e avisa. Tudo continua funcionando, só não compartilha.
- **Mapa indisponível** → tanto a biblioteca quanto a geometria do mundo são
  servidas pelo repositório, então na prática isso não acontece. Se ainda
  assim faltarem, a aba Mapa não deixa bolinhas soltas num fundo vazio: cai
  para a leitura de concentração geográfica em HTML puro, com a seleção de
  eventos preservada.

### Segurança

A chave em `assets/js/config.js` é a **publishable (anon) key** — feita para
ficar no front-end e protegida por Row Level Security. A `service_role` key
nunca deve entrar neste repositório.

Depois de carregada, a página faz chamadas de rede **apenas ao Supabase**.
Não há CDN de terceiros, hash SRI para manter, script externo executando na
página nem servidor de mapas. Tudo vem de `assets/vendor/`:

| | |
|---|---|
| Leaflet 1.9.4 + leaflet.heat 0.2.0 | ~210 KB · BSD |
| Inter, Syne, JetBrains Mono (latin + latin-ext) | ~380 KB · OFL |
| Geometria mundial Natural Earth 110m | ~170 KB · domínio público |
| Base de cidades GeoNames (3.7 mil praças) | ~200 KB · CC BY · carregada sob demanda |

Há um teste automatizado que falha se qualquer requisição externa reaparecer.

#### Acesso: público lê, autenticado edita

Qualquer pessoa com o link **vê** o orçamento — o superintendente abre e lê,
sem senha, que é o caso da maioria. **Alterar** exige entrar com conta.

Deslogada, a ferramenta fica explicitamente em somente-leitura: faixa de aviso
no topo e controles de edição inertes. Isso é afordância; a garantia é a RLS no
banco. Sem isso, alguém montaria um plano por cinco minutos para descobrir no
fim que não podia salvar.

A autoria deixa de ser texto digitado e passa a vir do token, com o banco
recusando gravação em nome de outra pessoa:

```sql
with check (updated_by = auth.jwt() ->> 'email')
```

Não há cadastro aberto nem recuperação de senha: são cinco pessoas, e cada
porta a mais é superfície de ataque. As contas são criadas no painel.

##### Como ativar

A **ordem importa**. Fechar as policies antes de publicar o site tira a edição
de quem estiver com a versão antiga aberta.

1. ~~**Criar as contas**~~ — feito: cinco contas `@bradesco.com.br`, já
   confirmadas, com uma senha compartilhada provisória. Senha compartilhada é
   provisória de verdade: enquanto ela valer, a autoria registrada no banco
   diz apenas qual conta gravou, não quem digitou. Cada pessoa deve trocar a
   sua (Authentication → Users → *Reset password*) antes de o número virar
   decisão orçamentária.
2. **Desligar o cadastro aberto** — Authentication → Providers → Email →
   *Allow new users to sign up* = **off**. Sem isso o portão não vale nada:
   qualquer pessoa com a chave publishable — que está no código-fonte da
   página, por definição — cria a própria conta e passa a escrever.
3. ~~**Publicar o site**~~ — feito: a `main` já carrega a versão com login.
4. ~~**Rodar** [`supabase/migracoes/01-fechar-escrita.sql`](supabase/migracoes/01-fechar-escrita.sql)~~
   — feito. Conferido no banco, com o papel trocado na marra:

   | Tentativa | Resultado |
   |---|---|
   | `anon` insere no plano | recusado (`42501`) |
   | `anon` apaga o plano inteiro | não apaga nada — a linha continua lá |
   | `anon` altera participantes | não altera nada |
   | autenticado escreve | grava, e a autoria vem do token |
   | autenticado assina como outra pessoa | recusado (`42501`) |

   `DELETE` e `UPDATE` de `anon` não devolvem erro: a RLS simplesmente não
   enxerga linha nenhuma para eles, então a operação acerta zero registros.
   Silencioso, mas inofensivo — e o `INSERT`, esse falha alto.

Se travar: [`supabase/migracoes/01-rollback.sql`](supabase/migracoes/01-rollback.sql)
devolve a escrita aberta em 30 segundos. A rede de segurança dos snapshots
continua valendo nos dois estados.

##### O que continua exposto

A leitura. Os números seguem visíveis a quem tiver a URL — foi escolha
consciente para não criar atrito com quem só lê. `robots.txt` e `noindex`
mantêm a página fora dos buscadores, o que é higiene, não controle de acesso.

Fechar também a leitura exigiria login para todo mundo, e a capa viraria tela
de login.

#### A rede de segurança que já existe

Enquanto a escrita é aberta, o plano é protegido por recuperação, não por
prevenção:

- Um **trigger no banco** guarda o estado do plano antes de qualquer exclusão,
  e a cada 10 minutos de uso. Fica no banco de propósito: um atacante não usa
  o nosso JavaScript.
- A tabela `eventos2027_snapshots` é **somente-leitura para anon** — dá para
  restaurar, mas não para apagar, forjar ou adulterar a trilha.
- As funções do trigger têm `EXECUTE` revogado de `anon`. Sem isso o PostgREST
  as exporia como `/rest/v1/rpc/<nome>`, e bastaria chamá-las em loop para
  expulsar os pontos legítimos da janela de 60 — apagando o histórico sem
  executar um único `DELETE`.

Restaurar é feito na interface, em **Cenários → Histórico automático**. Cada
snapshot guarda também a **política de viagens nacionais**, então restaurar um
ponto no tempo devolve o orçamento inteiro, não só a metade internacional.

**Limite conhecido:** o gatilho é o `DELETE` no plano. Editar só a política
nacional — mudar uma cadência, remover um polo — não tira snapshot por si só.
Como a escrita agora exige conta e cada remoção pede confirmação, e como a
política toda são meia dúzia de números, o risco é pequeno e a reconstrução é
de um minuto. Se um dia a política crescer, vale um gatilho próprio em
`settings`.

## Publicar no GitHub Pages

O site é estático e serve a partir da raiz do repositório de `main`, que é a
branch padrão. Uma única configuração, feita uma vez:

1. **Settings → Pages**
2. **Source:** `Deploy from a branch`
3. **Branch:** `main` · **Folder:** `/ (root)` → **Save**

Em poucos minutos o site fica em:

```
https://ramasousa.github.io/budget-eventos-2027/
```

O arquivo `.nojekyll` já está no repositório para o GitHub servir a pasta
`assets/` sem processar com Jekyll. Todos os caminhos são relativos, então o
site funciona no subdiretório do Pages sem ajuste nenhum.

---

## Manutenção

### Ajustar o custo de um evento

Supabase → Table Editor → `eventos2027_events` → edite a linha. A página lê
direto de lá; basta recarregar.

### Adicionar um evento

Pelo botão **+ Adicionar evento** na própria página — é o caminho normal.

Direto no banco, se preferir: insira uma linha em `eventos2027_events`.
Campos obrigatórios: `id`, `name`, `category` (`api`, `fin`, `tech`, `open`,
`dev`, `ai`), `month_num`. Preencha `lat`/`lng` para o evento aparecer no
mapa. Para que ele também exista no modo offline, replique-o em
`assets/js/data.js`.

### Mudar a política de viagens nacionais

Aba **Viagens nacionais**. O custo por viagem fica no cartão do polo; pessoas
e cadência, na matriz. Tudo grava na mesma linha de `settings`, então
alterações em sequência viram um `POST` só.

Para incluir um escritório novo: **+ Polo**, escolha a cidade na busca (a
coordenada vem junto) e defina o custo. A cadência de cada cargo começa em
zero — preencha na matriz.

### Mudar o câmbio ou o limite

Pela própria página, botão **Premissas**. Vale para todos.

### Reaplicar o schema do zero

Rode [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase.
É idempotente.

---

## Testes

```bash
npm i          # só Playwright, e só para os testes
npm test       # a bateria inteira
npm test 07    # só uma suíte
```

O `tests/rodar.js` sobe um **mock do Supabase** e um servidor estático, roda as
sete suítes **em série** — elas compartilham o mesmo banco simulado e se
atrapalham em paralelo — e derruba tudo no fim.

| Suíte | O que cobre |
|---|---|
| `01-orcamento` | catálogo, filtros, cálculo, mapa, calendário, consolidado, exportações |
| `02-modos-degradados` | sem geometria, sem biblioteca, sem banco, sem `config.js`, e duas pessoas editando |
| `03-adicionar-evento` | formulário, autocomplete de cidades, evento sem sede, remoção |
| `04-cenarios` | salvar, carregar e excluir cenários |
| `05-rede-de-seguranca` | executa o ataque de apagamento e verifica a recuperação |
| `06-capa` | números ao vivo, mundo em pontos, navegação entre as páginas |
| `07-login` | somente-leitura, portão de escrita, login, logout, sessão expirada |
| `08-viagens-nacionais` | política de visita aos polos: cadência, custo, polo novo, remoção, exportações |

O site em produção **não usa nada** do `package.json`: continua sendo HTML, CSS
e JavaScript servidos direto. Playwright é dependência de teste.

### Por que existe um mock do Supabase

`supabase.co` é inalcançável do ambiente onde este projeto foi construído, então
o handshake real nunca pôde ser exercitado aqui. O mock valida o **contrato** —
verbos, filtros, cabeçalhos `Prefer`, `/auth/v1`, e as policies (anon lê,
authenticated escreve, snapshots somente-leitura).

Um mock mais permissivo que a realidade esconde bug em vez de revelar: este já
pegou um `DELETE` que ignorava o filtro `id=eq.` e teria apagado uma tabela
inteira.

### Regressões que a bateria protege

Cada uma corresponde a um bug que **já aconteceu**:

- polígonos cruzando o antimeridiano viravam faixas atravessando o mapa
- redimensionar a janela com o mapa oculto derrubava a camada de calor
- uma regra `container > *` jogava os decorativos no fluxo e empurrava o hero
  1.540px para baixo
- a capa e a ferramenta mostrando totais diferentes
- na matriz de viagens nacionais, a cadência aparecia **zerada em toda célula**
  enquanto o rodapé somava certo: o objeto de cálculo sobrescrevia o mapa
  `viagens` (por polo) com o número total de deslocamentos
- `config.js` falhando ao carregar deixava as duas páginas **em branco**:
  `const SUPABASE` fica na zona morta e até `typeof SUPABASE` lança
- qualquer requisição externa reaparecendo

## Estrutura

```
index.html                 a capa
app.html                   a ferramenta: estrutura, modais e montagem
assets/css/styles.css      design system
assets/css/capa.css        estilos da capa
assets/js/auth.js          sessão: público lê, autenticado edita
assets/js/custo.js         cálculo de custo — fonte única das duas páginas
assets/js/capa.js          números ao vivo e o mundo em matriz de pontos
assets/js/config.js        URL e chave publishable do Supabase
assets/js/data.js          catálogo embarcado (fallback offline)
assets/js/store.js         persistência, sincronização e cenários
assets/js/app.js           cálculo de custo, views e exportações
assets/js/map.js           mapa de calor + modo autônomo
assets/vendor/leaflet/     Leaflet 1.9.4 + leaflet.heat (BSD)
assets/vendor/fonts/       Inter, Syne, JetBrains Mono (OFL)
assets/js/cidades.js       autocomplete de cidades (carregado sob demanda)
assets/vendor/world/       geometria mundial Natural Earth 110m (domínio público)
assets/vendor/cidades/     3.7 mil praças com país, região e coordenada
tools/gerar-mundo.js       regenera a geometria a partir do world-atlas
tools/gerar-cidades.js     regenera a base de cidades
tests/                     bateria: 7 suítes, mock do Supabase e orquestrador
supabase/schema.sql        tabelas, RLS e policies
supabase/migracoes/        fechar a escrita e o rollback correspondente
```

Sem build, sem `node_modules`, sem CDN. Abrir o `index.html` num servidor
estático já funciona.

O visual segue o **Design System Velo.ai**: superfícies cream e ink com
textura de ruído, Syne 800 nos números, Inter no corpo, JetBrains Mono nos
rótulos, eyebrow em cada seção e accordion no lugar de tabela plana.

---

## O mapa

O desenho do mundo vem de um GeoJSON (Natural Earth 110m, domínio público)
servido pelo próprio repositório — **sem servidor de tiles e sem chave de
API**. A versão anterior usava tiles do CARTO, que passaram a exigir chave e
cobriam o mapa de marcas d'água.

Regenerar a geometria, se um dia for preciso mais detalhe:

```bash
npm pack world-atlas@2 topojson-client@3
SCRATCH=<pasta-com-os-pacotes> node tools/gerar-mundo.js
```

O script corta os polígonos no antimeridiano. Sem isso, Fiji e a Rússia — que
têm território dos dois lados da linha de data — são desenhados como faixas
horizontais atravessando o mapa inteiro.

## A base de cidades

Alimenta o autocomplete do formulário de novo evento. Vem do GeoNames, via
`all-the-cities`, cruzada com `world-countries` para o nome do país em
português e a região.

```bash
npm pack all-the-cities@3 world-countries pbf@3 ieee754
SCRATCH=<pasta-com-os-pacotes> node tools/gerar-cidades.js
```

O corte é por população (120 mil), com duas correções necessárias:

- **Homônimas pequenas.** "Cologne" com 7 mil habitantes é uma cidade de
  Minnesota, não a Colônia alemã; o corte por população resolve.
- **Sedes de evento pequenas demais.** Davos, Cannes e Palo Alto ficariam de
  fora, então entram por uma lista explícita no script.

Os nomes em português são um mapa manual conferido contra o dataset — ele usa
"Munich", "Köln" e "New York City", não os nomes que se espera digitar.
