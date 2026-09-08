# Budget Eventos Internacionais 2027

Planejamento orçamentário de eventos internacionais de tecnologia para 2027 —
**Open Platform & BaaS, BU AI First · Banco Bradesco**.

Página única, colaborativa e publicada no GitHub Pages: qualquer pessoa com o
link vê o mesmo orçamento consolidado, em tempo real, sem instalar nada.

---

## O que a página faz

| Aba | Para quê |
|---|---|
| **Catálogo** | 24 eventos com custo aberto por pessoa, benefício estratégico, perfil de quem deve ir e resultado esperado. Selecione e defina participantes. |
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
| `eventos2027_events` | Catálogo. Editar custo de um evento = editar a linha aqui. |
| `eventos2027_plan` | **Plano vigente compartilhado.** É o que todos veem ao abrir. |
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
- **Servidor de mapas inacessível** → o Leaflet é servido pelo próprio
  repositório, então a biblioteca nunca falta; o que pode ser bloqueado é o
  servidor de tiles (CARTO). Se ele não responder, a aba Mapa não deixa
  bolinhas soltas num fundo vazio: cai para a leitura de concentração
  geográfica em HTML puro, com a seleção de eventos preservada.

### Segurança

A chave em `assets/js/config.js` é a **publishable (anon) key** — feita para
ficar no front-end e protegida por Row Level Security. A `service_role` key
nunca deve entrar neste repositório.

As policies hoje liberam leitura e escrita para quem tem o link, decisão
consciente: não há dado sensível, apenas estimativas de custo de eventos
públicos. Para restringir, altere as policies em [`supabase/schema.sql`](supabase/schema.sql)
e reaplique.

**Leaflet 1.9.4 e leaflet.heat 0.2.0 são servidos pelo próprio repositório**
(`assets/vendor/leaflet/`, ~210 KB, licenças BSD incluídas). Não há CDN de
terceiros, nem hash SRI para manter, nem script externo executando na página.

Sobra uma única dependência de rede: os **tiles** do mapa, que vêm do CARTO.
Ver [Dependência de tiles](#dependência-de-tiles).

---

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

Insira uma linha em `eventos2027_events`. Campos obrigatórios: `id`, `name`,
`category` (`api`, `fin`, `tech`, `open`, `dev`, `ai`), `month_num`.
Preencha `lat`/`lng` para o evento aparecer no mapa.

Para que o evento também exista no modo offline, replique-o em
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
assets/vendor/leaflet/     Leaflet 1.9.4 + leaflet.heat (BSD, servidos localmente)
supabase/schema.sql        tabelas, RLS e policies
```

Sem build, sem `node_modules`, sem CDN. Abrir o `index.html` num servidor
estático já funciona.

---

## Dependência de tiles

O desenho do mundo (as "tiles") vem de `basemaps.cartocdn.com`. É a única
chamada externa que a página faz depois de carregar. Se o domínio estiver
liberado, você vê o mapa completo; se não, a aba degrada sozinha para a
leitura em HTML puro e ninguém fica travado.

Para eliminar também essa dependência, há dois caminhos:

- **Liberar o domínio** `*.basemaps.cartocdn.com` na rede — o mais simples.
- **Servir tiles próprios**: aponte a URL em `assets/js/map.js`
  (`L.tileLayer(...)`) para um servidor interno de tiles. O resto do código
  não muda.

Atualizar o Leaflet, quando for o caso:

```bash
npm pack leaflet@<versão> leaflet.heat@<versão>
# extraia dist/leaflet.js, dist/leaflet.css, dist/images/ e dist/leaflet-heat.js
# para assets/vendor/leaflet/
```
