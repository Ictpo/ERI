"""Built-in stopword lists for the four supported languages.

Compact function-word lists (articles, prepositions, pronouns, auxiliaries,
common adverbs). Users can extend them per-analysis via custom_stopwords.
"""

STOPWORDS: dict[str, frozenset[str]] = {
    "en": frozenset("""
a about above after again against all am an and any are aren't as at be because been
before being below between both but by can cannot could couldn't did didn't do does
doesn't doing don't down during each few for from further had hadn't has hasn't have
haven't having he he'd he'll he's her here here's hers herself him himself his how
how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most
mustn't my myself no nor not of off on once only or other ought our ours ourselves
out over own same shan't she she'd she'll she's should shouldn't so some such than
that that's the their theirs them themselves then there there's these they they'd
they'll they're they've this those through to too under until up very was wasn't we
we'd we'll we're we've were weren't what what's when when's where where's which while
who who's whom why why's with won't would wouldn't you you'd you'll you're you've
your yours yourself yourselves will just also get got one two may might must shall
""".split()),
    "pt": frozenset("""
a à às ao aos aquela aquelas aquele aqueles aquilo as até com como da das de dela
delas dele deles depois do dos e é ela elas ele eles em entre era eram éramos essa
essas esse esses esta está estamos estão estas estava estavam estávamos este esteja
estejam estejamos estes esteve estive estivemos estiver estivera estiveram estivermos
estivesse estivessem estou eu foi fomos for fora foram fôramos forem formos fosse
fossem fôssemos fui há haja hajam hajamos hão havemos haver hei houve houvemos
houver houvera houverá houveram houverão houverei houverem houveremos houveria
houveriam houveríamos houvermos houvesse houvessem isso isto já lhe lhes mais mas me
mesmo meu meus minha minhas muito na não nas nem no nos nós nossa nossas nosso nossos
num numa o os ou para pela pelas pelo pelos por qual quando que quem são se seja
sejam sejamos sem ser será serão serei seremos seria seriam seríamos seu seus só
somos sou sua suas também te tem tém temos tenha tenham tenhamos tenho terá terão
terei teremos teria teriam teríamos teu teus teve tinha tinham tínhamos tive tivemos
tiver tivera tiveram tivermos tivesse tivessem tu tua tuas um uma você vocês vos
foi ainda bem cada coisa depois dois duas ele então essa vez outro outra onde
""".split()),
    "fr": frozenset("""
à ai aie aient aies ait as au aura aurai auraient aurais aurait auras aurez auriez
aurions aurons auront aux avaient avais avait avec avez aviez avions avons ayant
ayez ayons c ce ceci celà ces cet cette d dans de des du elle en es est et eu eue
eues eûmes eurent eus eusse eussent eusses eussiez eussions eut eût eûtes eux fûmes
furent fus fusse fussent fusses fussiez fussions fut fût fûtes il ils j je l la le
les leur leurs lui m ma mais me mes moi mon même n ne nos notre nous on ont ou où
par pas pour qu que quel quelle quelles quels qui s sa sans se sera serai seraient
serais serait seras serez seriez serions serons seront ses soi soient sois soit
sommes son sont soyez soyons suis sur t ta te tes toi ton tu un une vos votre vous
y étaient étais était étant étiez étions été étée étées étés êtes être aussi bien
cela ça comme donc encore faire fait plus très tout tous toute toutes alors si
""".split()),
    "es": frozenset("""
a al algo algunas algunos ante antes como con contra cual cuando de del desde donde
durante e el él ella ellas ellos en entre era erais éramos eran eres es esa esas
ese eso esos esta estaba estabais estaban estabas estad estada estadas estado
estados estamos estando estar estaremos estará estarán estarás estaré estaréis
estaría estaríais estaríamos estarían estarías estas este estemos esto estos estoy
estuve estuviera estuvierais estuvieran estuvieras estuvieron estuviese estuvieseis
estuviesen estuvieses estuvimos estuviste estuvisteis estuviéramos estuviésemos
estuvo está estábamos estáis están estás esté estéis estén estés fue fuera fuerais
fueran fueras fueron fuese fueseis fuesen fueses fui fuimos fuiste fuisteis fuera
ha habida habidas habido habidos habiendo habremos habrá habrán habrás habré
habréis habría habríais habríamos habrían habrías habéis había habíais habíamos
habían habías han has hasta hay haya hayamos hayan hayas hayáis he hemos hube
hubiera hubierais hubieran hubieras hubieron hubiese hubieseis hubiesen hubieses
hubimos hubiste hubisteis hubiéramos hubiésemos hubo la las le les lo los me mi mis
mucho muchos muy más mí mía mías mío míos nada ni no nos nosotras nosotros nuestra
nuestras nuestro nuestros o os otra otras otro otros para pero poco por porque que
quien quienes qué se sea seamos sean seas seremos será serán serás seré seréis
sería seríais seríamos serían serías seáis sido siendo sin sobre sois somos son soy
su sus suya suyas suyo suyos sí también tanto te tendremos tendrá tendrán tendrás
tendré tendréis tendría tendríais tendríamos tendrían tendrías tened tenemos
tenga tengamos tengan tengas tengo tengáis tenida tenidas tenido tenidos teniendo
tenéis tenía teníais teníamos tenían tenías ti tiene tienen tienes todo todos tu
tus tuve tuviera tuvierais tuvieran tuvieras tuvieron tuviese tuvieseis tuviesen
tuvieses tuvimos tuviste tuvisteis tuviéramos tuviésemos tuvo tuya tuyas tuyo
tuyos tú un una uno unas unos usted ustedes vosotras vosotros vuestra vuestras
vuestro vuestros y ya yo aún así bien cada cosa dos hace más ser vez
""".split()),
}


def stopwords_for(lang: str, custom: list[str] | None = None) -> frozenset[str]:
    base = STOPWORDS.get(lang, frozenset())
    if custom:
        base = base | frozenset(w.strip().lower() for w in custom if w.strip())
    return base
