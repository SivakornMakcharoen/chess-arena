export function renderCheckersBoard({game, mode, myColor, lastMove, onSquareClick}) {
  const board = document.getElementById('checkerboard');
  board.innerHTML = '';
  const flipped = mode === 'custom' && myColor === 'black';

  for (let vi = 0; vi < 64; vi++) {
    const i = flipped ? 63 - vi : vi;
    const r = Math.floor(i / 8), c = i % 8;
    const sq = document.createElement('div');
    sq.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
    sq.dataset.idx = i;

    if (lastMove && (i === lastMove.from || i === lastMove.to)) sq.classList.add('last-move');
    if (game.selected === i) sq.classList.add('selected');
    const validDests = game.validMoves.filter(m => m.from === game.selected).map(m => m.to);
    if (validDests.includes(i)) sq.classList.add('valid-move');

    const p = game.board[i];
    if (p) {
      const div = document.createElement('div');
      div.className = 'piece ' + (p.color === 'red' ? 'white-piece' : 'black-piece') + (p.king ? ' king' : '');
      sq.appendChild(div);
    }

    if ((r + c) % 2 === 1) sq.addEventListener('click', () => onSquareClick(i));
    board.appendChild(sq);
  }

  updateCheckersSidebar(game);
}

export function updateCheckersSidebar(game) {
  if (!game) return;
  const st = document.getElementById('status-bar-c');
  if (game.status === 'playing') {
    st.textContent = game.turn === 'red' ? '⚪ White Turn' : '⬛ Black Turn';
    st.style.color = game.turn === 'red' ? '#FFFFFF' : '#94A3B8';
  } else {
    st.textContent = game.status === 'red_wins' ? '⚪ White Wins!' : '⬛ Black Wins!';
  }
  document.getElementById('row-red-c').className = 'player-row' + (game.turn === 'red' ? ' active' : '');
  document.getElementById('row-black-c').className = 'player-row' + (game.turn === 'black' ? ' active' : '');
  document.getElementById('captured-red-c').textContent = '×' + game.capturedBlack;
  document.getElementById('captured-black-c').textContent = '×' + game.capturedRed;
}
