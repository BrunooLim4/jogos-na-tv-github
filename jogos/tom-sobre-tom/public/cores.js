// O tabuleiro: 480 cores em 16 linhas (A a P, de cima para baixo) e 30 colunas
// (1 a 30, da esquerda para a direita), como no Tom Sobre Tom de verdade.
// As cores foram medidas do tabuleiro original (tabela em referencias/as-480-cores.png).
// Usado pelo servidor (regras), pela TV e pelo celular — sem nada de tela aqui.

export const ROWS = 16;
export const COLS = 30;
export const CELLS = ROWS * COLS;

// Uma linha por letra; cada cor em hexadecimal sem o "#".
const TABLE = [
  '612c13 6d2a15 762317 871f1b 951f20 a01e23 af2026 c92329 e22029 ed2129 ec2028 ed2129 ec1e31 ec1e3d ea1c46 e91b56 e61665 e21175 d81183 d3188d c92791 bc2d92 b33695 a93795 a13a95 933a96 8d4098 853f98 7f4198 75449a', // A
  '894c20 954521 9d4122 ae4126 bb3a27 c82e29 d82b29 e62328 ed2429 ee282d ee2936 ed253e ed2245 ed224f ed1f61 ed1570 ed0e7e e90f8e db2a92 ce3a95 c04097 b53e97 a93e97 9f4098 983f97 8f3f98 853f98 7f4198 734098 6a3e97', // B
  'a6632a ad5c28 bc5c28 c45128 d04a29 da432a e43b28 eb3027 ee362e ef3c42 ef3f4e ef3b52 ef3b60 ee3069 ee2b7a ed2489 ea3295 dc4699 ca4a9b bb4d9c b64a9c a6499b 9f479a 954499 8d459a 843f98 7b3e98 743e98 673b97 5c3492', // C
  'ca852b d9832b df772a e97a26 e86a27 ec5f27 f2612d f15832 f0513f f15753 f15e67 f15f6c f05872 f05380 ef508d ef509d e058a0 cd59a2 bf60a5 b659a2 a555a1 9c4f9e 954d9e 8e4b9d 83469a 7c449a 6f4099 683a96 593794 47308c', // D
  'e99e25 f39a20 f79420 f68e20 f68625 f4792f f3773d f36f46 f37052 f37868 f27677 f27782 f2778b f17195 f06aa5 e772ac d372ac c772ae bc72af ae68aa a060a6 945aa5 8e56a3 8652a2 7c4a9d 6f489d 644099 593794 4b3190 353187', // E
  'fdb417 fcb123 fbac2a fbac3c faa842 f9a44e f89957 f6905f f58966 f58874 f59084 f59190 f48f9b f48ea6 f389b6 e18dbb d18cbd c78dbe bb83b9 ab7bb6 9d76b4 9167ac 8860a9 7b5ba7 7352a2 644da0 5a449b 4d3794 3c338f 2f2d78', // F
  'fec216 fdc029 fcb72c fcb53b fcba60 f8ad58 faac64 f9a46e f8a479 f7a187 f7a097 f69f9a f69fa7 f59bab f39ec4 e1a6cb d3a7cc ceafd3 b898c7 a98cc1 9a83bd 8a77b6 806fb2 7566ad 685eaa 5a56a5 504da0 46449b 323a95 2f3388', // G
  'fbd116 fdcf2e fec930 fdc841 fec84c fdbf5b fdbc61 fcba6c fbb37a fab083 f9af8f f9b3a0 f5b8ae f4b7b6 efb6c9 d8b7d7 ceb9d9 ccbfdc b5abd4 a7a0ce 9894c9 8389c3 757ebd 6b77b9 5d6cb3 5163ae 475aa8 3f51a3 2f479d 243f98', // H
  'f8e515 fade26 fbda36 fbda43 fbe14c fed95b fcdc63 fad76a f5de7c f1e393 ece09f e8e4b5 e1e1c4 dce4cc d3e3d4 c6e1e8 c2daf2 c2daf1 a7c8e9 9abae0 8aabda 7ba1d5 7193cc 6787c5 567abc 4e6db4 4263ae 3c5da9 3551a3 2a4a9e', // I
  'f5ed26 f5ed2b f7ed36 f4ee4c f5ef52 f4ef62 f4ef6e edee85 e7eb8f dfe99e d8e8ad d5e9c0 d3e8cc cde7d1 c9e7d8 bce4e3 b4e3f3 b4e2f7 a0ddf5 89d6f5 7ec8ef 74b5e4 66a9db 5d98d1 4f8cca 4e7dbf 3f70b7 3567b1 385daa 3053a3', // J
  'f1ec44 f2ed46 f1ed4c f1ec53 f0ec5b eaea6b e6ea7e e0e886 d7e485 c9e08e bfdd98 b5daa4 b5dbaf b1dbb5 afdbc1 afded8 abdedf a9dde1 99d9e8 8bd6ef 74d1f6 66ccf4 60bdeb 5aabdd 569ed5 488ac9 3d7ec1 3d71b7 3566b0 355eab', // K
  'efea28 ece930 e9e835 e8e840 e6e749 dce455 cfe063 c0da6a b1d56f a9d378 9fd080 99cf8a 93cf9a 8dcd9c 90cfa8 8ed0b3 90d2bf 8cd1c8 84cfcb 7aced4 6acbd9 57c8df 3dc7f0 39bded 3da9df 389ad4 4289c8 347bbd 3d71b7 3566b1', // L
  'e1e425 dce22c d7e037 cedd3a c8db45 bad647 afd34e a0ce53 91c959 87c762 7ac46b 72c272 70c27c 6dc284 6fc48c 71c594 71c69e 74c8a8 76c8ac 6bc7b5 62c5bb 56c4c5 49c3d0 37c2db 1ebde8 22aae1 279cd7 388dcb 2d80c3 2373b7', // M
  'c4d931 bcd631 b4d336 abcf3b 9fcc3b 95c941 81c343 78c145 70be47 5cb647 53b64a 4bb455 45b859 46b86a 50bb74 59bd7b 5abe7f 5fbf8a 60c08b 61c193 5cc19f 55c1ab 43c0b3 35bfc3 2cc0ce 1fbcdb 13aedf 1da6de 2496d2 2d86c6', // N
  '9fc63b 9ac63e 95c43e 88c141 81be42 6cb545 62b246 54aa47 50a747 40a048 35a048 2ea64a 29ac4b 32b34c 35b555 39b65f 42b865 44b96f 46ba71 51bc77 54bd86 48bd90 41be9f 36bda8 26beb8 2ebfc5 24bfd2 14b5d5 16a9dd 1ea0da', // O
  '7ca741 77ac43 70aa45 67a544 58a646 4ca247 449a46 399947 279447 1d8b45 198d45 169347 189c49 1ca44a 22ad4b 2cb34d 33b44d 36b556 3ab65f 3eb666 3eb971 38b97d 31b98a 23ba98 1abaa0 15bbac 1dbcbd 1ebdc8 17b9d9 17b3e5', // P
];

export const BOARD = TABLE.flatMap(line => line.split(' ').map(hex => `#${hex}`));

export const rowOf = cell => Math.floor(cell / COLS);
export const colOf = cell => cell % COLS;
export const cellAt = (row, col) => row * COLS + col;
export const isCell = cell => Number.isInteger(cell) && cell >= 0 && cell < CELLS;

// "C12": a letra da linha e o número da coluna (como está escrito no tabuleiro).
export const ROW_LETTERS = 'ABCDEFGHIJKLMNOP';
export const cellName = cell => `${ROW_LETTERS[rowOf(cell)]}${colOf(cell) + 1}`;

// Distância em "casas", contando a diagonal como 1 (o quadro de pontos é um quadrado).
export function distance(a, b) {
  return Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));
}
