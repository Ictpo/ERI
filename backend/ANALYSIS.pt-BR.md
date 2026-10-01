# ERI — Como as análises são calculadas

Este documento especifica a matemática por trás dos quatro métodos de análise do
ERI e o pipeline de processamento de texto compartilhado que os alimenta. É um
companheiro do código em `backend/app/`; as referências a arquivo/linha apontam
para a implementação de referência. Nada aqui usa R — todo o motor é
NumPy / SciPy / scikit-learn / NetworkX.

Os quatro métodos são despachados por nome em
[`app/main.py`](app/main.py) (`RUNNERS = {"stats", "chd", "similarity", "afc"}`):

| Nome | Método | Módulo |
|------|--------|--------|
| `stats` | Estatísticas descritivas de texto | [`app/analysis/stats.py`](app/analysis/stats.py) |
| `chd` | Classificação hierárquica descendente de Reinert | [`app/analysis/chd.py`](app/analysis/chd.py) |
| `similarity` | Rede de similaridade por coocorrência | [`app/analysis/similarity.py`](app/analysis/similarity.py) |
| `afc` | Análise fatorial de correspondência | [`app/analysis/afc.py`](app/analysis/afc.py) |

---

## 1. Pipeline de processamento de texto compartilhado

Toda análise parte do mesmo pré-processamento. Os parâmetros ficam em
`TextParams` ([`app/nlp/tokenize.py`](app/nlp/tokenize.py)); os padrões estão
entre parênteses.

### 1.1 Tokenização

`raw_tokens(text)` extrai tokens de palavra com a expressão regular

```
[^\W\d]+(?:['’_-][^\W\d]+)*
```

ou seja, sequências de **letras** Unicode (acentos incluídos, **sem dígitos**),
permitindo apóstrofos, hifens e sublinhados internos. Cada token é passado para
minúsculas e `’` é normalizado para `'`. Os sublinhados são preservados de
propósito para que a pessoa usuária possa proteger formas compostas
(`dia_a_dia`) e travar o lema de uma forma de superfície (`havaianas_`),
seguindo a convenção clássica do Iramuteq.

### 1.2 Normalização → "formas" de análise

`normalize_tokens(tokens, p)` transforma os tokens brutos nas **formas** que as
análises contam:

**Elisão do francês (só `lang = fr`), antes do passo 1:** o clítico elidido é
separado da palavra à qual se liga: `c'est` → `c` + `est`, `qu'il` → `qu` +
`il`, `l'école` → `l` + `école` (clíticos `c d j l m n s t qu jusqu lorsqu
puisqu quoiqu`; tokens com sublinhado não são tocados). O clítico é então
removido como *stop-word* ou pela regra de comprimento, e a palavra é contada
na forma simples. `aujourd'hui` e `quelqu'un` não são elisões e ficam
inteiras. `total_tokens` (§2) continua contando `c'est` como uma palavra.

1. Remove *stop-words* (`remove_stopwords`, ligado por padrão). As listas de
   palavras funcionais embutidas para `en / pt / fr / es` ficam em
   [`app/nlp/stopwords.py`](app/nlp/stopwords.py); a pessoa usuária pode
   adicionar `custom_stopwords`.
2. **Lematiza** (`lemmatize`, ligado por padrão) com `simplemma` (Python puro,
   baseado em dicionário, `en/pt/fr/es`). Se um token não tem lema, mantém-se a
   forma de superfície. Tokens **contendo `_` nunca são lematizados**
   (protegidos pela pessoa usuária).
3. Descarta novamente qualquer coisa que seja *stop-word* após a lematização ou
   que tenha comprimento < 2.

O idioma precisa ser um de `en, pt, fr, es` (recai para `en` se inválido).

### 1.3 Segmentação em Unidades de Contexto Elementares (UCE)

Os métodos multivariados (CHD, similaridade) operam sobre **segmentos**, não
sobre documentos inteiros. `segment_corpus`
([`app/nlp/segment.py`](app/nlp/segment.py)) agrupa frases consecutivas em
segmentos de aproximadamente `seg_size` tokens de palavra (padrão 40), cortando
em fronteiras de frase (`. ! ? ; quebra de linha`). Uma única frase mais longa
que `1.6 × seg_size` é dividida à força em blocos de palavras. Este é o
"segmento" de Reinert / *unité de contexte élémentaire*.

### 1.4 Matriz segmento × forma

`build_segment_matrix` ([`app/analysis/matrix.py`](app/analysis/matrix.py))
produz a matriz de projeto binária compartilhada por CHD e similaridade:

- Mantém as **formas ativas**: formas que ocorrem pelo menos `min_freq` vezes
  (padrão 3) em todos os segmentos; limitadas a `MAX_ACTIVE_FORMS = 3000` mais
  frequentes.
- Constrói `X ∈ {0,1}^(n_segmentos × n_formas)`: `X[s, f] = 1` se a forma `f`
  ocorre no segmento `s` (**presença/ausência, não contagens**).
- Segmentos sem nenhuma forma ativa são descartados. São exigidos pelo menos 2
  segmentos utilizáveis.

`form_freq` (total de ocorrências no corpus por forma) é mantido junto de `X`.

`X` é guardada em formato **esparso** (CSR do SciPy): só as posições dos 1 são
mantidas. Os valores são exatamente os da matriz densa; muda só a memória (um
corpus de 44 entrevistas: 2.980 × 1.567 células, 0,95% de uns — 37 MB densa,
0,7 MB esparsa).

### 1.5 Núcleo de análise de correspondência (compartilhado por CHD e AFC)

`correspondence_analysis(N, n_axes)` ([`app/analysis/ca.py`](app/analysis/ca.py))
fatora qualquer tabela de contingência não negativa `N` (linhas × colunas) por
meio da SVD dos **resíduos padronizados** — a AC clássica de Benzécri:

```
P = N / N.sum()                 # matriz de correspondência (frequências relativas)
r = P.sum(axis=1)               # massas de linha    (marginais de linha)
c = P.sum(axis=0)               # massas de coluna   (marginais de coluna)
E = r ⊗ c                       # esperado sob independência
S = (P − E) / sqrt(E)           # resíduos padronizados (de Pearson)
S = U Σ Vᵀ                      # SVD reduzida
```

Eixos nulos (`σ ≤ 1e-12`) são descartados; uma tabela sem variância gera erro.
Mantendo as `k = n_axes` maiores triplas singulares, as **coordenadas
principais** são

```
row_coords = (U Σ) / sqrt(r)     # linhas no espaço fatorial
col_coords = (V Σ) / sqrt(c)     # colunas no mesmo espaço
```

Grandezas derivadas:

- **Autovalores (inércia por eixo):** `λ = σ²`.
- **Inércia total:** `Σ S²` (igual ao χ²/N da tabela).
- **Inércia explicada** do eixo `a`: `λ_a / Σ S²`.
- **Contribuições** de um ponto para um eixo:
  `massa · coord² / λ` (linha: `r·row_coords²/λ`; coluna: `c·col_coords²/λ`).

Linhas/colunas que eram todas zero são reexpandidas com coordenadas zero e massa
zero para que a indexação coincida com a da entrada.

#### Dois métodos de cálculo

Tabelas de até `DENSE_SVD_MAX_CELLS = 12.000.000` células (e toda tabela da
AFC) usam a SVD **exata** densa acima. Tabelas esparsas maiores (CHD e
similaridade em corpora perto do limite de 30 MB) nunca montam `S`: calculam só
as `n_axes` primeiras triplas singulares com o método de Lanczos do ARPACK
(`svds`), usando

```
Q = D_r^(-1/2) · P · D_c^(-1/2)        # esparsa, mesmos zeros de N
S = Q − sqrt(r) sqrt(c)ᵀ               # aplicada implicitamente:
S v  = Q v  − sqrt(r) (sqrt(c)ᵀ v)
Sᵀ u = Qᵀ u − sqrt(c) (sqrt(r)ᵀ u)
Σ S² = Σ Q² − 1                        # inércia total, pois P, r e c somam 1
```

com um vetor inicial fixo (semente 0), então também é determinístico. Numa
tabela aleatória de 3.000 × 1.800, os dois métodos concordam em ~4·10⁻¹³ em
todas as coordenadas, **a menos do sinal de cada eixo**. Esse sinal é
arbitrário em qualquer SVD; a AFC não é afetada, mas a varredura de cortes e o
desempate do CHD não são simétricos em relação ao sinal, então uma tabela que
cruza o limite pode receber outra classificação (igualmente válida). O limite
foi escolhido para que corpora reais de entrevistas (≈ 9 milhões de células
mesmo com `min_freq = 1`) fiquem no método exato e reproduzam os resultados de
antes.

---

## 2. Estatísticas de texto (`stats`)

Fonte: [`app/analysis/stats.py`](app/analysis/stats.py). Opera sobre
**documentos inteiros** (sem segmentação).

Para cada documento: `raw_tokens` → `normalize_tokens`. Depois agrega:

- `total_tokens` — soma das contagens de tokens **brutos** (antes do filtro de
  formas), o tamanho do corpus em palavras corridas.
- `freq` — um `Counter` de forma → total de ocorrências.
- `doc_presence` — forma → número de documentos que a contêm (conta cada forma
  uma vez por documento, via `set(forms)`).
- `unique_forms` = número de formas distintas; `hapax` = formas com frequência
  exatamente 1; `hapax_count` o tamanho dessa lista.
- **Tabela de frequências**: `[{form, freq, docs}]` ordenada por frequência
  decrescente.
- **Por variável**: para cada variável do corpus e cada modalidade, sobre os
  documentos que carregam aquela modalidade: `tokens`, suas palavras corridas
  **brutas** (a mesma base de `total_tokens`), e `forms`, suas formas
  distintas após o filtro (a mesma base de `unique_forms`).
- **Dados de nuvem de palavras**: as `max_cloud_words` (padrão 150, limite 300)
  formas mais frequentes como `{form, freq}`.

Aqui não há estatística inferencial — é puramente contagem descritiva.

---

## 3. Classificação hierárquica descendente de Reinert (`chd`)

Fonte: [`app/analysis/chd.py`](app/analysis/chd.py). Este é o método de Reinert:
**bipartições** sucessivas da matriz segmento × forma, cada divisão encontrada
por análise de correspondência e refinada por realocação, produzindo um
dendrograma de **classes** lexicais.

Parâmetros: `seg_size` (padrão 40), `max_classes` (padrão 6, limitado a 2–12).
Constante `MIN_LEAF = 5` (uma classe precisa manter ≥ 5 segmentos).

### 3.1 χ² da partição

A qualidade de dividir um grupo de segmentos em dois perfis de vocabulário é o
χ² da tabela `2 × V` das contagens de formas somadas (`_partition_chi2`). Para
grupos com totais de coluna `c1, c2` (`ct = c1 + c2`, sobre as colunas presentes
em qualquer um dos dois):

```
t1 = Σc1,  t2 = Σc2,  total = t1 + t2
e1 = ct · t1/total     e2 = ct · t2/total          # esperado
χ² = Σ (c1 − e1)²/e1  +  Σ (c2 − e2)²/e2
```

### 3.2 Encontrando uma divisão (`_best_split`)

Para um grupo com matriz `X` (≥ `2·MIN_LEAF` linhas, ≥ 2 colunas não vazias):

1. Roda a AC (`n_axes = 3`) na submatriz de colunas não vazias.
2. **Candidata A — corte clássico de Reinert:** ordena os segmentos pela
   coordenada do **primeiro eixo da AC**; varre cada posição de corte `k` (de
   `MIN_LEAF` até `n − MIN_LEAF`, no máximo `MAX_CUT_CANDIDATES = 200` posições)
   e escolhe o `k` que maximiza o χ² da partição de `{primeiros k}` vs
   `{restante}` (calculado incrementalmente a partir das somas cumulativas).
3. **Candidata B — 2-médias:** k-means (`k=2`, `n_init=5`) sobre as coordenadas
   fatoriais da AC, mantida somente se ambos os lados tiverem ≥ `MIN_LEAF`
   linhas. Isso captura contrastes que o eixo 1 sozinho não consegue ordenar.
4. **Realocação / consolidação** (`_refine_split`, ≤ 20 iterações) em cada
   candidata: com `global_rate` = presença média por forma e perfis de grupo
   `p1, p2` = presença média dentro de cada lado, calcula pesos de razão
   logarítmica

   ```
   w1 = log((p1 + ε)/(global_rate + ε))
   w2 = log((p2 + ε)/(global_rate + ε))          ε = 1e-9
   ```

   e reatribui cada segmento ao grupo 1 se `X·w1 > X·w2` (o perfil ao qual ele
   se ajusta melhor). Itera enquanto o χ² da partição continuar melhorando e
   ambos os lados permanecerem ≥ `MIN_LEAF`.
5. Escolhe a candidata com o maior χ² refinado; em quase-empates, prefere a
   divisão **mais equilibrada**.

Retorna a máscara booleana de pertencimento e seu χ², ou `None` se o grupo não
puder ser dividido.

### 3.3 Construindo a árvore

Começa com todos os segmentos como a raiz. Repetidamente pega o **maior**
cluster terminal que ainda pode ser dividido, bipartite-o e substitui-o pelos
seus dois filhos — até que existam `max_classes` clusters terminais ou nada mais
possa ser dividido (`run_chd`). Os clusters terminais, ordenados por tamanho
decrescente, tornam-se as classes `1..K`.

### 3.4 Perfilando cada classe

Para cada classe (máscara de pertencimento `in_class`):

- **Palavras características** (`_word_profile`): para cada forma, uma tabela
  `2×2` (segmentos dentro/fora da classe × contendo/não contendo a forma) e seu
  χ² via `scipy.stats.chi2_contingency` (sem correção de Yates). Somente formas
  **sobre-representadas** são mantidas (contagem observada na classe > esperada
  `(a+b)·n_in/n`), ordenadas por χ² decrescente, top 40. Cada entrada reporta
  `{form, chi2, p, freq_in, freq_total}`. O **rótulo** da classe são as 3 formas
  do topo unidas por " / ".
- **Variáveis características** (`_variable_profile`): o mesmo teste χ² `2×2`
  para cada modalidade de variável do corpus vs pertencimento à classe; mantida
  se sobre-representada e `p < 0.05`; top 15.
- **Segmentos característicos** (`_characteristic_segments`): cada segmento da
  classe pontuado pela soma dos χ²-de-classe de suas formas distintas; top 10
  com pontuação positiva — as frases de exemplo mais típicas.

### 3.5 Saída

`{n_segments, n_classified, pct_classified, tree, classes}`, onde `tree` é o
dendrograma serializado (`{id, size, class_id, children}` aninhados) e `classes`
carrega os perfis acima. `pct_classified` é a fração de todos os segmentos que
contêm ao menos uma forma ativa; todo segmento assim é atribuído a uma classe
(segmentos sem forma ativa ficam de fora).

**Isto não é o "% de segmentos classificados" do Reinert / Alceste / Iramuteq.**
Lá, esse número é uma taxa de retenção: segmentos são descartados quando não
caem em uma classe terminal retida (pequena demais, ou instável entre as duas
execuções de uma classificação dupla), e pesquisadores o leem como um teste de
adequação (em geral ≥ 75%). O ERI não tem etapa de retenção, então
`pct_classified` fica perto de 100% por construção e não deve ser relatado como
esse teste. A chave mantém o nome por compatibilidade com resultados salvos; a
interface a rotula como "usable".

---

## 4. Rede de similaridade por coocorrência (`similarity`)

Fonte: [`app/analysis/similarity.py`](app/analysis/similarity.py). Constrói um
grafo das formas mais frequentes ligadas por quão frequentemente elas
**coocorrem no mesmo segmento**.

Parâmetro: `max_terms` (padrão 60, limitado a 5–200).

1. Segmenta o corpus e constrói `X` (§1.4). Mantém as `max_terms` formas mais
   frequentes; `X` é restrito a essas colunas.
2. **Matriz de coocorrência** (nível de segmento, a partir da matriz binária):

   ```
   seg_count = X.sum(axis=0)     # segmentos contendo cada forma  (a_i)
   C = Xᵀ X                      # C[i,j] = segmentos contendo tanto i quanto j
   ```

3. Para cada par `i < j` com `cooc = C[i,j] ≥ 2`, adiciona uma aresta ponderada
   por `cooc`, mais duas similaridades normalizadas:

   ```
   Jaccard(i,j) = cooc / (a_i + a_j − cooc)
   cosseno(i,j) = cooc / sqrt(a_i · a_j)
   ```

   (Pares que coocorrem só uma vez são descartados como ruído.)
4. **Comunidades**: maximização gulosa de modularidade
   (`networkx.community.greedy_modularity_communities`, ponderada por `cooc`).
   A partição cobre todos os nós: uma forma sem arestas forma sua própria
   comunidade unitária e ainda recebe uma cor da paleta. Só quando o grafo não
   tem nenhuma aresta todos os nós recebem `-1`.
5. **Exibição: árvore máxima (padrão).** A visualização
   ([`similarity-view.tsx`](../frontend/components/results/similarity-view.tsx),
   `maxSpanningTree`) desenha por padrão a *arbre maximum* do Iramuteq:
   Kruskal sobre as arestas ordenadas por peso decrescente na métrica escolhida
   (coocorrência, Jaccard ou cosseno), calculada na interface depois dos
   filtros "Min node freq" e "Min edge weight". Um grafo desconexo gera uma
   *floresta* geradora máxima. As comunidades vêm do passo 4 (grafo completo,
   pesos `cooc`), então uma comunidade pode se estender por vários ramos da
   árvore. Desligue "Max spanning tree" para desenhar todas as arestas.

Saída: `{nodes: [{id, freq, community}], edges: [{source, target, cooc,
jaccard, cosine}], n_segments}`. O tamanho do nó na interface reflete a
frequência no corpus; o peso da aresta reflete a coocorrência; a cor reflete a
comunidade.

---

## 5. Análise fatorial de correspondência (`afc`)

Fonte: [`app/analysis/afc.py`](app/analysis/afc.py). Projeta **palavras** e as
**modalidades de uma variável do corpus** em um plano fatorial compartilhado,
mostrando qual vocabulário é característico de qual modalidade.

Parâmetros: `variable` (obrigatório — a variável do corpus a analisar),
`max_words` (padrão 120, limitado a 10–400).

1. Agrupa os documentos pelo valor (**modalidade**) da `variable` escolhida;
   documentos sem valor são pulados. Tokeniza cada documento (§1.1–1.2) e
   acumula as contagens de forma por modalidade e uma frequência global. São
   exigidas pelo menos **2 modalidades**.
2. **Vocabulário ativo**: formas com frequência global ≥ `min_freq`, as
   `max_words` do topo (≥ 3 exigidas).
3. **Tabela de contingência** `N` de formato `(formas_ativas × modalidades)`:
   `N[f, m]` = ocorrências da forma `f` em documentos da modalidade `m`.
4. Roda o núcleo de AC (§1.5) com `n_axes = 3` se houver > 3 modalidades, senão
   `2`.
5. Emite, para linhas (palavras) e colunas (modalidades):
   `{label, x, y, z, mass, contrib_x, contrib_y, contrib_z, freq}` — `x,y,z`
   são coordenadas principais dos eixos 1–3, `mass` o peso marginal,
   `contrib_x,y,z` a contribuição percentual para os eixos 1–3 (`z` e
   `contrib_z` são `null` quando não há terceiro eixo), `freq` a frequência
   bruta. `explained` dá a porcentagem de inércia por eixo.

O mapa se lê como qualquer *biplot* de AC: palavras plotadas perto de uma
modalidade estão sobre-representadas nela; a distância à origem e `contrib_*`
indicam quão fortemente um ponto estrutura cada eixo.

---

## Relato de progresso e erros

Cada *runner* recebe um callback `progress(fraction, stage)` (transmitido à
interface via SSE por [`app/jobs.py`](app/jobs.py)) e levanta `AppError`s
estruturados ([`app/errors.py`](app/errors.py)) com uma mensagem em linguagem
simples e uma sugestão de correção quando o corpus é pequeno demais, uniforme
demais, ou os parâmetros filtram todo o vocabulário.

## Determinismo

Todos os resultados são determinísticos para um dado corpus e conjunto de
parâmetros: o k-means usa o scikit-learn com `random_state=0`, o método
truncado parte de um vetor fixo, e todo o resto (SVD, varreduras de χ²,
contagem) é exato. As versões das bibliotecas são fixadas em
`backend/requirements.txt`, então cada versão do app empacota as mesmas
bibliotecas numéricas com que os testes rodaram. Um corpus que cresce além de
`DENSE_SVD_MAX_CELLS` troca de método na AC; veja §1.5 para o que isso pode
mudar.
