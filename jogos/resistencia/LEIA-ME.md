# Resistência

Jogo de **papéis secretos**, de 5 a 10 pessoas (inspirado no The Resistance).
Quase todos são da **Resistência**, mas alguns são **espiões** escondidos. A cada
rodada, um time vai para uma missão. A Resistência quer que as missões deem certo;
os espiões tentam sabotar sem serem descobertos. Quem vencer 3 missões ganha.

## Como abrir
1. Dois cliques em `iniciar.bat` — a tela da TV abre sozinha.
2. Cada pessoa lê o QR code com a câmera do celular e entra com nome e ficha (cor).
3. Todos tocam em "Estou pronto!" e o líder 👑 toca em "Começar partida".

Para testar sozinho: abra o `iniciar.bat`, depois `testar-com-robos.bat`, e entre
pelo celular. Quatro robôs entram (com você, dá 5). Os robôs jogam no chute.

## Na partida
1. **As cartas:** a TV distribui uma das 12 cartas de personagem para cada um
   (sorteadas a cada partida). A sua aparece no celular.
2. **Ver o papel:** no celular, **segure** a sua carta: ela vira e mostra o papel
   no verso (solta, ela volta). Espião também vê quem são os outros espiões.
   Depois toque em "Já vi meu papel".
3. **Montar o time:** quem está com a ⭐ (comanda) toca nos nomes no celular. A TV
   mostra na hora quem foi escolhido. Conversem!
4. **Votar:** todos tocam em 👍 Aprovo ou 👎 Recuso. Quando todos votam, a TV
   mostra o voto de cada um. Mais da metade aprovando, o time vai. Se 5 times
   seguidos forem recusados, os espiões vencem.
5. **Missão:** quem está no time escolhe em segredo **Sucesso** ou **Sabotar**
   (a Resistência sempre escolhe Sucesso). A TV embaralha as cartas e mostra só
   quantas sabotagens houve, nunca de quem. Enquanto a TV revela, o celular diz
   "Olhem a TV!".
6. No fim, a TV mostra quem eram os espiões, e o líder pode tocar em "Jogar de novo".

## Sons
Sons de cidade em revolta, só nos momentos importantes e junto com as animações da
TV: lata de spray (alguém entra), baralho (distribuir as cartas), carimbo (votação),
coração batendo (revelação da missão), choque elétrico (sabotagem), sirene (missão
sabotada) e tambores com hino ou acorde sombrio no fim. O celular de quem passa a
comandar faz um bipe de rádio. Para ouvir todos: com o jogo aberto, entre em
`http://localhost:3040/sons`.

## Privacidade
- O papel só aparece no celular enquanto o dono segura a carta.
- Os botões Sucesso e Sabotar são iguais para todos, e depois de escolher aparece
  só "Escolha enviada".
- O celular só toca para quem passa a comandar.
