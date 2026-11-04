# Lobisomem na TV

O jogo do lobisomem em uma noite só: cada pessoa recebe um personagem secreto no
celular, à noite todo mundo faz a sua parte no celular ao mesmo tempo, de dia todos
conversam no sofá e, no fim, votam em quem deve morrer. A TV mostra a vila e a mesa;
o celular é o controle de cada um. Sem app: é tudo página web.

## Como usar

1. Dê dois cliques em `iniciar.bat`. A tela da TV abre sozinha.
2. Se o Windows perguntar sobre o firewall, clique em **Permitir**.
3. No celular (mesmo Wi-Fi do PC), aponte a câmera para o QR code.

Precisa de **3 a 10 jogadores**. Cada um entra com o nome e uma **ficha de cor**. O primeiro
a entrar é o **líder** 👑: quando todos derem "pronto", o celular do líder começa a partida.

Para testar sozinho: com o jogo ligado, dê dois cliques em `testar-com-robos.bat`. Três
robôs entram depois de você. De dia, toque em **"Votar agora"** para não esperar o relógio.

Para parar, feche a janela preta (ou Ctrl+C nela). O Lobisomem usa a porta 3080.

## Como se joga (o que aparece em cada tela)

1. **As cartas voam na TV**: uma para cada um e três para o meio da mesa.
2. **A noite caiu.** No celular, **segure a sua carta** para ver quem você é e o que fazer.
   Toque nas cartas que ela manda (jogadores ou as do meio) e em **Confirmar**. Quem não tem
   nada a fazer toca numa carta qualquer: assim ninguém percebe quem é quem.
3. **Amanheceu!** Segure a carta de novo para ver o que você descobriu à noite. Conversem:
   quem é o lobisomem? A TV mostra o relógio. O líder pode "Votar agora" ou dar "+1 minuto".
4. **Hora de votar.** Cada um toca em quem deve morrer. Dá para trocar até o último votar.
5. **O resultado na TV**: as setas de quem votou em quem, quem morreu (a carta vira), as
   outras cartas virando, as do meio, e quem venceu. Embaixo aparece **o que aconteceu à noite**.
6. O líder pode **"Jogar de novo"** (as vitórias de cada um vão somando ★).

**Quem vence** (vale a carta que você tiver no FIM — ela pode ter sido trocada à noite!):
- **A vila**: se um lobisomem morrer.
- **Os lobisomens** (e o Lacaio): se nenhum lobisomem morrer.
- **O Curtidor**: só se ele mesmo morrer.

## Os personagens (16 cartas, desenhadas pelo Bruno)

Lobisomem (2), Lacaio, Vidente, Ladrão, Encrenqueira, Bêbado, Insone, Maçom (2), Caçador,
Curtidor, Sósia e Aldeão (3). Cada partida usa o número de jogadores + 3 cartas, sorteadas
pelo jogo: sempre os 2 Lobisomens, a Vidente, o Ladrão e a Encrenqueira; o resto é sorteado.

## Visual e sons

- **As cartas** no mesmo padrão; o **verso** é um lobisomem uivando para a lua, em azul
  e dourado, num céu estrelado.
- A TV tem **a vila à noite** atrás de tudo: casas com janelas acesas que piscam, a igreja, a
  lua, estrelas e névoa. O céu muda: noite, amanhecer, dia e o fim de tarde vermelho da votação.
- Sons só na TV: toc-toc na porta, baralho, o uivo do lobo, sinos e passarinhos ao amanhecer,
  tambores da votação, gongo de quem morre, o tiro do Caçador e a festa de quem vence.
  Para ouvir cada um pelo PC: `http://localhost:3080/sons`. **O celular não faz som** (à noite
  todos mexem juntos; um barulho entregaria alguém).

## Privacidade

Só o servidor sabe tudo. A TV só fica sabendo quem já terminou a noite e quem já votou — nunca
a carta de alguém nem em quem votou, até o fim (quando as cartas viram, como no jogo de mesa).
Cada celular só recebe o que é dele.

## Como está organizado

| Arquivo | O que é |
|---|---|
| `server.js` | Servidor: sala, líder, QR, relógio do dia, conversa com TV e celulares |
| `game/jogo.js` | Regras (cartas, noite, dia, votação, quem vence) |
| `public/papeis.js` | Os personagens: time, o que fazer à noite, que cartas tocar |
| `public/tv.html`, `tv.css`, `tv.js` | Tela da TV (palco 1920×1080, a mesa, as animações) |
| `public/cenario.js` | A vila à noite (desenhada em código) |
| `public/phone.html`, `phone.js` | Tela do celular (segurar a carta, tocar, votar) |
| `public/style.css` | O visual (cores, letras, fichas, cartas) |
| `public/cartas/` | As 16 cartas e o verso (feitas por `tools/montar-cartas.py`) |
| `public/fila.js`, `public/tempos.js` | A fila das animações da TV e quanto dura cada uma |
| `public/sound.js`, `public/sons.html` | Os sons; ouvir em `/sons` |
| `tools/teste-regras.mjs`, `tools/teste-sala.mjs` | Testes das regras e de uma partida pela rede |
| `tools/robos.mjs`, `tools/montar-cena.mjs` | Robôs que jogam; cena parada numa fase (fotos) |
