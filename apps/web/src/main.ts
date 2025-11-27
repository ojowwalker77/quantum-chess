import type { WasmExports, PlayerColor, Position, ServerMessage } from "./wasm-types";

const PIECES = {
    white: { pawn: '♙', knight: '♘', bishop: '♗', rook: '♖', queen: '♕', king: '♔' },
    black: { pawn: '♟', knight: '♞', bishop: '♝', rook: '♜', queen: '♛', king: '♚' }
} as const;

const PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const;
const COLORS = ['white', 'black'] as const;

let wasm: WasmExports;
let ws: WebSocket;
let roomCode: string | null = null;
let myColor: PlayerColor | null = null;
let selectedSquare: Position | null = null;

let gameState: ServerMessage | null = null;

let moveHistory: string[] = [];

function connectWebSocket(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('Connected to server');
    };

    ws.onmessage = (event) => {
        const data: ServerMessage = JSON.parse(event.data);
        handleServerMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setLobbyStatus('Connection error');
    };

    ws.onclose = () => {
        setLobbyStatus('Disconnected from server');
    };
}

function handleServerMessage(data: ServerMessage): void {
    switch (data.type) {
        case 'room_created':
            roomCode = data.roomCode!;
            myColor = data.color!;
            enterGame();
            setLobbyStatus(`Room created: ${roomCode}`);
            break;

        case 'room_joined':
            roomCode = data.roomCode!;
            myColor = data.color!;
            enterGame();
            document.getElementById('status')!.textContent = 'Waiting for opponent...';
            break;

        case 'opponent_joined':
            document.getElementById('status')!.textContent = 'Opponent joined! Game started.';
            break;

        case 'game_state':
            console.log('Game state received:', data);
            gameState = data;
            selectedSquare = null;
            updateBoard();

            if (data.gameOver) {
                handleGameOver(data.gameOver);
                break;
            }

            const isMyTurn = data.currentTurn === myColor;
            if (isMyTurn) {
                document.getElementById('status')!.textContent = 'Your turn';
            } else {
                document.getElementById('status')!.textContent = "Opponent's turn";
            }

            if (data.isInCheck && isMyTurn) {
                document.getElementById('status')!.textContent = 'Your turn - CHECK!';
            }
            break;

        case 'move_rejected':
            console.error('Move rejected:', data.reason);
            document.getElementById('status')!.textContent = `Invalid move: ${data.reason}`;
            selectedSquare = null;
            break;

        case 'opponent_disconnected':
            document.getElementById('status')!.textContent = 'Opponent disconnected';
            break;

        case 'move_made':
            if (data.notation) {
                moveHistory.push(data.notation);
                updateMoveHistory();
            }
            break;

        case 'error':
            setLobbyStatus(data.message!);
            break;
    }
}

function createRoom(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        setTimeout(createRoom, 100);
        return;
    }
    ws.send(JSON.stringify({ type: 'create_room' }));
}

function joinRoom(): void {
    const input = (document.getElementById('roomCode') as HTMLInputElement).value.trim().toUpperCase();
    if (!input) {
        setLobbyStatus('Enter a room code');
        return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        setTimeout(() => joinRoom(), 100);
        return;
    }
    ws.send(JSON.stringify({ type: 'join_room', roomCode: input }));
}

function enterGame(): void {
    document.getElementById('lobby')!.style.display = 'none';
    document.getElementById('game')!.style.display = 'block';
    document.getElementById('roomDisplay')!.textContent = roomCode!;
    document.getElementById('colorDisplay')!.textContent = myColor!;
    createBoard();
    updateBoard();
}

function setLobbyStatus(msg: string): void {
    document.getElementById('lobbyStatus')!.textContent = msg;
}

async function init(): Promise<void> {
    try {
        const response = await fetch('wasm/quantum-chess.wasm');
        const buffer = await response.arrayBuffer();
        const module = await WebAssembly.instantiate(buffer, { env: {} });
        wasm = module.instance.exports as WasmExports;
        wasm.initGame();
        connectWebSocket();
    } catch (error) {
        console.error('Failed to load WASM:', error);
        setLobbyStatus('Failed to load game. Build WASM first: bun run build');
    }
}

function createBoard(): void {
    const board = document.getElementById('board')!;
    board.innerHTML = '';

    for (let row = 7; row >= 0; row--) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = 'square ' + ((row + col) % 2 === 0 ? 'dark' : 'light');
            square.dataset.row = row.toString();
            square.dataset.col = col.toString();
            square.onclick = () => handleSquareClick(row, col);
            board.appendChild(square);
        }
    }
}

function updateBoard(): void {
    if (!myColor || !gameState) return;

    const board = document.getElementById('board')!;
    const squares = board.children;
    const isMyTurn = gameState.currentTurn === myColor;

    for (let i = 0; i < 64; i++) {
        const square = squares[i] as HTMLElement;
        square.innerHTML = '';
        square.classList.remove('selected', 'valid-move', 'in-check');
    }

    if (gameState.myPieces) {
        for (const { type, position } of gameState.myPieces) {
            const squareIndex = (7 - position.row) * 8 + position.col;
            const square = squares[squareIndex] as HTMLElement;

            const pieceDiv = document.createElement('div');
            pieceDiv.className = 'piece';
            pieceDiv.textContent = PIECES[myColor][type];
            pieceDiv.style.color = myColor === 'white' ? '#ffffff' : '#000000';
            square.appendChild(pieceDiv);
        }
    }

    if (gameState.opponentQuantumStates) {
        for (const quantumState of gameState.opponentQuantumStates) {
            for (const position of quantumState.positions) {
                const squareIndex = (7 - position.row) * 8 + position.col;
                const square = squares[squareIndex] as HTMLElement;

                const rowDiv = document.createElement('div');
                rowDiv.className = 'piece-row';

                const pieceDiv = document.createElement('div');
                pieceDiv.className = 'piece';
                const probability = Math.round(quantumState.probability * 100);
                pieceDiv.style.opacity = probability === 100 ? '1' : '0.7';
                pieceDiv.style.fontSize = '32px';
                pieceDiv.textContent = PIECES[quantumState.color][quantumState.piece];
                pieceDiv.style.color = quantumState.color === 'white' ? '#ffffff' : '#000000';

                rowDiv.appendChild(pieceDiv);

                if (probability < 100) {
                    const probDiv = document.createElement('div');
                    probDiv.className = 'quantum-prob';
                    probDiv.textContent = probability + '%';
                    rowDiv.appendChild(probDiv);
                }

                square.appendChild(rowDiv);
            }
        }
    }

    if (selectedSquare) {
        const squareIndex = (7 - selectedSquare.row) * 8 + selectedSquare.col;
        const square = squares[squareIndex] as HTMLElement;
        square.classList.add('selected');

        if (isMyTurn && wasm) {
            const myColorIndex = COLORS.indexOf(myColor);
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const isValid = wasm.isValidMove(selectedSquare.row, selectedSquare.col, row, col, myColorIndex);
                    if (isValid) {
                        const targetSquareIndex = (7 - row) * 8 + col;
                        const targetSquare = squares[targetSquareIndex] as HTMLElement;
                        targetSquare.classList.add('valid-move');
                    }
                }
            }
        }
    }

    document.getElementById('turnDisplay')!.textContent = `turn: ${gameState.currentTurn}`;

    document.getElementById('checkDisplay')!.style.display = gameState.isInCheck ? 'inline' : 'none';

    if (gameState.isInCheck && isMyTurn && gameState.myPieces) {
        for (const { type, position } of gameState.myPieces) {
            if (type === 'king') {
                const squareIndex = (7 - position.row) * 8 + position.col;
                const square = squares[squareIndex] as HTMLElement;
                square.classList.add('in-check');
                break;
            }
        }
    }
}

function handleSquareClick(row: number, col: number): void {
    if (!myColor || !gameState || isGameOver) return;

    const isMyTurn = gameState.currentTurn === myColor;

    if (!isMyTurn) {
        document.getElementById('status')!.textContent = 'Not your turn';
        return;
    }

    const hasPieceAt = (pos: Position): boolean => {
        return gameState!.myPieces?.some(p =>
            p.position.row === pos.row && p.position.col === pos.col
        ) || false;
    };

    if (selectedSquare) {
        const isSameSquare = selectedSquare.row === row && selectedSquare.col === col;

        if (isSameSquare) {
            selectedSquare = null;
            updateBoard();
        } else {
            const selectedPiece = gameState.myPieces?.find(p =>
                p.position.row === selectedSquare.row && p.position.col === selectedSquare.col
            );
            const isPromotion = selectedPiece?.type === 'pawn' &&
                ((myColor === 'white' && row === 7) || (myColor === 'black' && row === 0));

            if (isPromotion) {
                showPromotionDialog(selectedSquare, { row, col });
            } else {
                ws.send(JSON.stringify({
                    type: 'move',
                    from: { row: selectedSquare.row, col: selectedSquare.col },
                    to: { row, col }
                }));

                document.getElementById('status')!.textContent = 'Waiting for server...';
            }
        }
    } else {
        if (hasPieceAt({ row, col })) {
            selectedSquare = { row, col };
            updateBoard();
            document.getElementById('status')!.textContent = 'Select destination';
        }
    }
}

let isGameOver = false;

function showPromotionDialog(from: Position, to: Position): void {
    const modal = document.createElement('div');
    modal.id = 'promotionModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: #1a1a1a;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        border: 2px solid #444;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Choose promotion piece';
    title.style.cssText = 'color: #fff; margin-bottom: 15px;';
    content.appendChild(title);

    const pieces: Array<{ type: PieceType; symbol: string }> = [
        { type: 'queen', symbol: myColor === 'white' ? '♕' : '♛' },
        { type: 'rook', symbol: myColor === 'white' ? '♖' : '♜' },
        { type: 'bishop', symbol: myColor === 'white' ? '♗' : '♝' },
        { type: 'knight', symbol: myColor === 'white' ? '♘' : '♞' }
    ];

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: center;';

    for (const { type, symbol } of pieces) {
        const button = document.createElement('button');
        button.textContent = symbol;
        button.style.cssText = `
            width: 60px;
            height: 60px;
            font-size: 40px;
            cursor: pointer;
            background: #333;
            color: ${myColor === 'white' ? '#fff' : '#000'};
            border: 2px solid #666;
            border-radius: 5px;
        `;
        button.onclick = () => {
            modal.remove();
            ws.send(JSON.stringify({
                type: 'move',
                from: { row: from.row, col: from.col },
                to: { row: to.row, col: to.col },
                promotion: type
            }));
            document.getElementById('status')!.textContent = 'Waiting for server...';
        };
        buttonContainer.appendChild(button);
    }

    content.appendChild(buttonContainer);
    modal.appendChild(content);
    document.body.appendChild(modal);
}

function handleGameOver(gameOver: { winner: string; reason: string }): void {
    isGameOver = true;

    let message: string;
    if (gameOver.reason === 'checkmate') {
        if (gameOver.winner === myColor) {
            message = 'CHECKMATE! You win!';
        } else {
            message = 'CHECKMATE! You lose.';
        }
    } else if (gameOver.reason === 'stalemate') {
        message = 'STALEMATE! Game is a draw.';
    } else if (gameOver.reason === 'resign') {
        if (gameOver.winner === myColor) {
            message = 'Opponent resigned. You win!';
        } else {
            message = 'You resigned. Opponent wins.';
        }
    } else {
        message = `Game over: ${gameOver.winner} wins by ${gameOver.reason}`;
    }

    document.getElementById('status')!.textContent = message;
    showGameOverModal(message);
}

function showGameOverModal(message: string): void {
    const modal = document.createElement('div');
    modal.id = 'gameOverModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: #1a1a1a;
        padding: 40px;
        border-radius: 10px;
        text-align: center;
        border: 2px solid #444;
    `;

    const text = document.createElement('h2');
    text.textContent = message;
    text.style.cssText = 'color: #fff; margin-bottom: 20px; font-size: 24px;';

    const button = document.createElement('button');
    button.textContent = 'New Game';
    button.style.cssText = `
        padding: 10px 30px;
        font-size: 18px;
        cursor: pointer;
        background: #4a4a4a;
        color: white;
        border: none;
        border-radius: 5px;
    `;
    button.onclick = () => {
        modal.remove();
        location.reload();
    };

    content.appendChild(text);
    content.appendChild(button);
    modal.appendChild(content);
    document.body.appendChild(modal);
}

function openRules(): void {
    document.getElementById('rulesModal')!.style.display = 'flex';
}

function closeRules(event?: Event): void {
    if (!event || (event.target as HTMLElement).id === 'rulesModal') {
        document.getElementById('rulesModal')!.style.display = 'none';
    }
}

function resign(): void {
    if (isGameOver || !ws || ws.readyState !== WebSocket.OPEN) return;

    if (confirm('Are you sure you want to resign?')) {
        ws.send(JSON.stringify({ type: 'resign' }));
    }
}

function updateMoveHistory(): void {
    const moveList = document.getElementById('moveList');
    if (!moveList) return;

    let html = '';
    for (let i = 0; i < moveHistory.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = moveHistory[i] || '';
        const blackMove = moveHistory[i + 1] || '';

        html += `<div class="move-row">
            <span class="move-number">${moveNum}.</span>
            <span class="move-white">${whiteMove}</span>
            <span class="move-black">${blackMove}</span>
        </div>`;
    }
    moveList.innerHTML = html;

    moveList.scrollTop = moveList.scrollHeight;
}

(window as any).createRoom = createRoom;
(window as any).joinRoom = joinRoom;
(window as any).openRules = openRules;
(window as any).closeRules = closeRules;
(window as any).resign = resign;

init();
