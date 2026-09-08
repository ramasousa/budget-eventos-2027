# Budget Eventos Internacionais 2027

Planejamento orçamentário de eventos internacionais de tecnologia para 2027 —
**Open Platform & BaaS, BU AI First · Banco Bradesco**.

Página única, colaborativa e publicada no GitHub Pages: qualquer pessoa com o
link vê o mesmo orçamento consolidado, em tempo real, sem instalar nada.

Interface no **Design System Velo.ai**. **Zero dependências externas** — nada
de CDN, fontes remotas ou servidor de mapas: tudo é servido pelo próprio
repositório, o que importa numa rede corporativa que bloqueia domínios de
terceiros.

---

## O que a página faz

| Aba | Para quê |
|---|---|
| **Catálogo** | 24 eventos com custo aberto por pessoa, benefício estratégico, perfil de quem deve ir e resultado esperado. Selecione, defina participantes e **inclua eventos que faltam**. |
| **Mapa de calor** | Onde o ecossistema se concentra (*Mercado*) versus onde estamos indo e quanto custa cada praça (*Nosso plano*). |
| **Calendário 2027** | Distribuição no ano, custo por mês e alerta de concentração de ausências. |
| **Consolidado** | Visão de apresentação: KPIs, composição de custo, distribuição geográfica e por trimestre, tabela detalhada e premissas. |

O painel de orçamento à direita acompanha todas as abas: total, limite,
percentual comprometido e saldo.

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

#### O que ainda está aberto — e por quê

O site é público (GitHub Pages é público) e a policy de escrita é aberta.
Ou seja: **quem tiver o link pode ler e alterar o plano**. Isso foi uma escolha
consciente para o superintendente e os pares abrirem sem fricção, mas tem duas
consequências que valem estar escritas:

- Não há controle de acesso. `robots.txt` e `noindex` mantêm a página fora dos
  buscadores, o que é higiene, **não** segurança.
- A autoria (`updated_by`) é texto livre digitado na página. Ela orienta, mas
  não prova nada.

Fechar isso de verdade exige autenticação. O caminho recomendado é
**público lê, autenticado edita**: Supabase Auth por magic link ou SSO do
domínio do banco, RLS de escrita passando de `using(true)` para
`using(auth.role() = 'authenticated')`, e a autoria vindo do token.

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

Restaurar é feito na interface, em **Cenários → Histórico automático**.

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

### Mudar o câmbio ou o limite

Pela própria página, botão **Premissas**. Vale para todos.

### Reaplicar o schema do zero

Rode [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase.
É idempotente.

---

## Estrutura

```
index.html                 estrutura, modais e montagem
assets/css/styles.css      design system
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
supabase/schema.sql        tabelas, RLS e policies
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
