// Piano alimentare 4 settimane (stesso contenuto del PDF).
// Ogni settimana: 7 giorni (lun → dom) con pranzo e cena, più la spesa della dieta.

export const DIET = {
  colazioni: [
    '2 uova sode (preparate la domenica) + 1 fetta di pane integrale',
    '2 fette di pane integrale + Philadelphia light + fesa di pollo o bresaola',
    'Latte parzialmente scremato (o bevanda di soia) + 30 g di fiocchi d\'avena + 1 frutto',
    '100 g di ricotta + cannella + 10 mandorle o noci',
  ],
  spuntini: [
    '1 frutto',
    '15–20 mandorle o noci',
    '1 porzione snack di grana (30 g)',
    'Carote, finocchi o cetrioli crudi',
  ],
  porzioni: [
    ['Pasta / riso / farro / cous cous', '60–70 g crudi (solo a pranzo)'],
    ['Pane integrale', '50 g (1 fetta media)'],
    ['Carne o pesce', '150 g'],
    ['Uova', '2'],
    ['Legumi in barattolo', '½ barattolo sgocciolato'],
    ['Tonno', '1 scatoletta (80 g sgocciolato)'],
    ['Formaggio fresco / feta', '70–100 g'],
    ['Olio extravergine', '1 cucchiaio a pasto'],
    ['Verdure', 'libere: metà piatto'],
  ],
  regole: [
    'Cucina la cena doppia: una porzione la mangi, l\'altra va subito nel contenitore per il pranzo di domani.',
    'La famiglia mangia la stessa cena: per marito e bimbi aggiungi pasta, pane o patate.',
    'Carboidrati a pranzo; a cena proteine e verdure, al massimo 1 fetta di pane.',
    'Con Wegovy: mangia piano e fermati appena sei sazia. Niente fritti né cibi molto grassi. Bevi 1,5–2 litri d\'acqua al giorno.',
    'Libramed prima dei pasti con 2 bicchieri d\'acqua.',
  ],
  prepDomenica: [
    'Lessa 8 uova (durano 5 giorni)',
    'Prepara il pranzo di lunedì',
    'Lava e taglia insalata, carote e pomodori',
    'Affetta e congela il pane integrale',
  ],
  settimane: [
    {
      nota: 'Usiamo quello che hai già in casa. Da lunedì a mercoledì si consuma il fresco, da giovedì il congelatore.',
      giorni: [
        { pranzo: 'Insalatona: insalata, pomodoro, carote grattugiate, tonno, mais + 1 fetta di pane', cena: 'Salsicce di pollo e tacchino in padella con zucchine e cipolla', doppio: true },
        { pranzo: 'Salsicce e zucchine avanzate + 60 g di riso', cena: 'Spezzatino di macinato e funghi con un po\' di pelati, mangiato come secondo con insalata e 1 fetta di pane (per i bimbi va sulla pasta)', doppio: true },
        { pranzo: '70 g di pasta condita col macinato e funghi avanzati', cena: 'Straccetti di petto di pollo con funghi + insalata e pomodoro', doppio: true },
        { pranzo: 'Straccetti di pollo avanzati + carote + 1 fetta di pane', cena: 'Salmone in padella o al forno + broccoli (fai doppi i broccoli)', doppio: true },
        { pranzo: 'Pasta integrale con broccoli e tonno', cena: 'Frittata di spinaci al forno + pomodoro' },
        { pranzo: 'Piadina integrale con fesa di pollo, Philadelphia e insalata', cena: '🍕 Pasto libero: pizza margherita o con verdure', libero: true },
        { pranzo: 'In famiglia: pasta al pomodoro (70 g) + verdure', cena: 'Pesce spada in padella con pomodorini e zucchine' },
      ],
      spesa: ['Uova (10)', 'Pane integrale', 'Pomodorini', 'Frutta per 7 giorni', 'Latte', 'Piadina integrale'],
    },
    {
      giorni: [
        { pranzo: 'Insalata di riso: riso, tonno, mais, pomodorini, uovo sodo (preparata domenica)', cena: 'Fettine di pollo al limone + zucchine trifolate', doppio: true },
        { pranzo: 'Pollo e zucchine avanzati + 1 fetta di pane', cena: 'Hamburger di manzo magro + insalata e finocchi' },
        { pranzo: 'Pasta integrale con tonno e pomodorini', cena: 'Uova strapazzate con spinaci + 1 fetta di pane (scongela le verdure grigliate per domani)' },
        { pranzo: 'Cous cous con ceci e verdure grigliate', cena: 'Merluzzo al forno + broccoli' },
        { pranzo: 'Minestrone + ½ barattolo di fagioli (da scaldare al lavoro)', cena: 'Salsicce di pollo + verdure grigliate' },
        { pranzo: 'Bresaola, rucola e grana + 1 fetta di pane', cena: '🍕 Pasto libero', libero: true },
        { pranzo: 'Pollo arrosto della rosticceria (senza pelle) + insalata: prendine uno grande', cena: 'Vellutata + 2 uova sode' },
      ],
      spesa: ['Fettine di pollo (300 g)', '2 hamburger di manzo magro', 'Uova (10)', 'Zucchine', 'Finocchi', 'Pomodorini', 'Insalata in busta', 'Rucola', 'Bresaola', 'Grana', 'Frutta', 'Merluzzo surgelato', 'Verdure grigliate surgelate', 'Minestrone surgelato', 'Vellutata surgelata', 'Pollo arrosto (domenica, rosticceria)'],
    },
    {
      giorni: [
        { pranzo: 'Insalatona con il pollo arrosto avanzato + mais + 1 fetta di pane', cena: 'Salmone + zucchine in padella', doppio: true },
        { pranzo: 'Poke fai-da-te: salmone avanzato, 60 g di riso, zucchine, carote', cena: 'Polpette di macinato cotte nel sugo (senza friggere) + insalata o fagiolini', doppio: true },
        { pranzo: 'Polpette al sugo + 1 fetta di pane + verdure', cena: 'Insalata greca: feta, pomodori, cetrioli, cipolla, olive + 1 fetta di pane' },
        { pranzo: 'Pasta con 1 cucchiaino di pesto + fagiolini + tonno', cena: 'Gamberi con piselli (10 minuti in padella) + insalata', doppio: true },
        { pranzo: 'Gamberi e piselli avanzati + 60 g di riso', cena: 'Omelette con prosciutto cotto + spinaci' },
        { pranzo: 'Insalata di ceci, tonno, cipolla e pomodorini', cena: '🍕 Pasto libero', libero: true },
        { pranzo: 'In famiglia: carne al forno o pasta al ragù (70 g) + verdure', cena: 'Zuppa di lenticchie (barattolo + passata + cipolla, 15 minuti)', doppio: true },
      ],
      spesa: ['Salmone (oppure surgelato)', 'Macinato magro (300 g)', 'Feta', 'Cetrioli', 'Pomodori', 'Zucchine', 'Carote', 'Insalata', 'Prosciutto cotto (4 fette)', 'Uova (10)', 'Frutta', 'Gamberi surgelati', 'Piselli surgelati', 'Fagiolini surgelati', 'Spinaci surgelati'],
    },
    {
      giorni: [
        { pranzo: 'Zuppa di lenticchie avanzata + 1 fetta di pane', cena: 'Fettine di tacchino + finocchi e insalata', doppio: true },
        { pranzo: 'Tacchino avanzato + cous cous + pomodorini', cena: 'Hamburger di pollo + spinaci', doppio: true },
        { pranzo: 'Piadina integrale con hamburger di pollo, insalata e Philadelphia', cena: 'Frittata di zucchine al forno + pomodori', doppio: true },
        { pranzo: 'Frittata avanzata + insalata + 1 fetta di pane', cena: 'Platessa o merluzzo con pelati e olive + broccoli (fai doppi i broccoli)', doppio: true },
        { pranzo: 'Pasta integrale con tonno e broccoli', cena: 'Pesce spada + verdure grigliate' },
        { pranzo: 'Bresaola, grana e rucola + 1 fetta di pane', cena: '🍕 Pasto libero', libero: true },
        { pranzo: 'Pollo arrosto della rosticceria + insalata', cena: 'Minestrone + 2 uova sode' },
      ],
      spesa: ['Fettine di tacchino (300 g)', '2 hamburger di pollo', 'Zucchine', 'Finocchi', 'Insalata', 'Rucola', 'Bresaola', 'Grana', 'Uova (10)', 'Piadine integrali', 'Frutta', 'Platessa o merluzzo surgelati', 'Pesce spada surgelato', 'Broccoli surgelati', 'Verdure grigliate surgelate', 'Minestrone surgelato', 'Pollo arrosto (domenica, rosticceria)'],
    },
  ],
};

// Aggiunte rapide nella lista della spesa
export const QUICK = {
  dispensa: ['Pasta integrale', 'Riso basmati', 'Cous cous integrale', 'Tonno al naturale', 'Mais', 'Ceci', 'Fagioli', 'Lenticchie', 'Pelati / passata', 'Olio extravergine', 'Fiocchi d\'avena', 'Mandorle / noci', 'Libramed'],
  casa: ['Carta igienica', 'Scottex', 'Detersivo piatti', 'Pastiglie lavastoviglie', 'Detersivo lavatrice', 'Ammorbidente', 'Sacchi spazzatura', 'Sgrassatore', 'Sapone mani'],
  bambini: ['Pannolini', 'Salviette', 'Latte in polvere', 'Omogeneizzati', 'Pappe / creme cereali', 'Crema cambio', 'Merende scuola', 'Succhi di frutta'],
};
