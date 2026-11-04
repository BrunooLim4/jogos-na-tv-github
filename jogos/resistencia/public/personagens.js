// As 12 cartas de personagem (arte do Bruno: artes/identidade-resistencia/,
// recortadas por tools/recortar-cartas.py em img/cartas/<id>.webp).
// A cada partida, cada pessoa recebe uma carta sorteada. A carta é pública (a
// "cara" da pessoa na mesa); quem é espião continua segredo.
// (Para ENTRAR na sala, a pessoa escolhe uma cor — a ficha —, não um personagem.)
// O servidor importa este arquivo também (game/jogo.js): os dois usam a mesma lista.

export const PERSONAGENS = [
  { id: 'jack', name: 'Jack', title: 'Líder', quote: 'Alguém precisa mostrar o caminho.' },
  { id: 'alyssa', name: 'Alyssa', title: 'Estrategista', quote: 'Não é só sobre força. É sobre pensar dois passos à frente.' },
  { id: 'kai', name: 'Kai', title: 'Tecnológico', quote: 'Se tem um sistema, eu consigo hackear. O mundo é só código.' },
  { id: 'lena', name: 'Lena', title: 'Fria', quote: 'Sentimento atrapalha. Foco mantém a gente vivo.' },
  { id: 'rico', name: 'Rico', title: 'Soldado', quote: 'Eu não gosto de falar. Prefiro mostrar o resultado.' },
  { id: 'maya', name: 'Maya', title: 'Cura', quote: 'Gente também se cura com palavras. E eu cuido de vocês.' },
  { id: 'dante', name: 'Dante', title: 'Cientista', quote: 'Cada dado é uma peça. E cada peça nos aproxima da vitória.' },
  { id: 'sora', name: 'Sora', title: 'Caótica', quote: 'Regras são feitas pra quebrar. E eu adoro um caos bem planejado.' },
  { id: 'bruno', name: 'Bruno', title: 'Piloto', quote: 'Eu levo a gente para onde precisa. E volto, sempre.' },
  { id: 'zara', name: 'Zara', title: 'Observadora', quote: 'Eu vejo o que vocês não veem. E isso faz toda a diferença.' },
  { id: 'tito', name: 'Tito', title: 'Animador', quote: 'Rir também é resistência. Se a gente não se diverte, eles já ganharam.' },
  { id: 'elena', name: 'Elena', title: 'Justiça', quote: 'Não é só sobre vencer. É sobre fazer o que é certo, mesmo quando é difícil.' },
];

export const CHARACTER_IDS = PERSONAGENS.map(p => p.id);

export function personagem(id) {
  return PERSONAGENS.find(p => p.id === id) ?? null;
}

export const cardImage = id => `/img/cartas/${id}.webp`;
