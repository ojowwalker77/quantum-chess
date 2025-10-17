import type { WasmExports, PlayerColor, Position, ServerMessage } from "./wasm-types";

// Chess pieces
const PIECES = {
    white: { pawn: '♙', knight: '♘', bishop: '♗', rook: '♖', queen: '♕', king: '♔' },
    black: { pawn: '♟', knight: '♞', bishop: '♝', rook: '♜', queen: '♛', king: '♚' }
} as const;

const PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const;
const COLORS = ['white', 'black'] as const;

// Game state
let wasm: WasmExports;
let ws: WebSocket;
let roomCode: string | null = null;
let myColor: PlayerColor | null = null;
let selectedSquare: Position | null = null;

// Server-provided game state (source of truth)
let gameState: ServerMessage | null = null;

// WebSocket connection
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
            // Received complete game state from server - store and render
            console.log('Game state received:', data);
            gameState = data;
            selectedSquare = null; // Clear selection when state updates
            updateBoard();

            // Update turn status
            const isMyTurn = data.currentTurn === myColor;
            if (isMyTurn) {
                document.getElementById('status')!.textContent = 'Your turn';
            } else {
                document.getElementById('status')!.textContent = "Opponent's turn";
            }

            // Show check warning
            if (data.isInCheck && isMyTurn) {
                document.getElementById('status')!.textContent = 'Your turn - CHECK!';
            }
            break;

        case 'move_rejected':
            // Our move was rejected by server
            console.error('Move rejected:', data.reason);
            document.getElementById('status')!.textContent = `Invalid move: ${data.reason}`;
            selectedSquare = null;
            break;

        case 'opponent_disconnected':
            document.getElementById('status')!.textContent = 'Opponent disconnected';
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

// Initialize WASM
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

// Board UI
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

    // Clear all squares
    for (let i = 0; i < 64; i++) {
        const square = squares[i] as HTMLElement;
        square.innerHTML = '';
        square.classList.remove('selected', 'valid-move', 'in-check');
    }

    // Render my pieces (classical view from server)
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

    // Render opponent quantum pieces
    if (gameState.opponentQuantumStates) {
        for (const quantumState of gameState.opponentQuantumStates) {
            // For each quantum piece, render it at all its possible positions
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

    // Highlight selected square
    if (selectedSquare) {
        const squareIndex = (7 - selectedSquare.row) * 8 + selectedSquare.col;
        const square = squares[squareIndex] as HTMLElement;
        square.classList.add('selected');

        // Show valid moves using local WASM validation (for UI only)
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

    // Update turn display
    document.getElementById('turnDisplay')!.textContent = `turn: ${gameState.currentTurn}`;

    // Check indicator
    document.getElementById('checkDisplay')!.style.display = gameState.isInCheck ? 'inline' : 'none';

    // Highlight king in check
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
    if (!myColor || !gameState) return;

    const isMyTurn = gameState.currentTurn === myColor;

    if (!isMyTurn) {
        document.getElementById('status')!.textContent = 'Not your turn';
        return;
    }

    // Check if there's a piece at clicked position (from server state)
    const hasPieceAt = (pos: Position): boolean => {
        return gameState!.myPieces?.some(p =>
            p.position.row === pos.row && p.position.col === pos.col
        ) || false;
    };

    if (selectedSquare) {
        // Try to make a move
        const isSameSquare = selectedSquare.row === row && selectedSquare.col === col;

        if (isSameSquare) {
            // Deselect
            selectedSquare = null;
            updateBoard();
        } else {
            // Send move request to server (server validates and executes)
            ws.send(JSON.stringify({
                type: 'move',
                from: { row: selectedSquare.row, col: selectedSquare.col },
                to: { row, col }
            }));

            document.getElementById('status')!.textContent = 'Waiting for server...';
            // Server will send game_state which will clear selectedSquare
        }
    } else {
        // Select a piece if there's one at this position
        if (hasPieceAt({ row, col })) {
            selectedSquare = { row, col };
            updateBoard();
            document.getElementById('status')!.textContent = 'Select destination';
        }
    }
}

// Rules modal functions
function openRules(): void {
    document.getElementById('rulesModal')!.style.display = 'flex';
}

function closeRules(event?: Event): void {
    if (!event || (event.target as HTMLElement).id === 'rulesModal') {
        document.getElementById('rulesModal')!.style.display = 'none';
    }
}

// Make functions globally available
(window as any).createRoom = createRoom;
(window as any).joinRoom = joinRoom;
(window as any).openRules = openRules;
(window as any).closeRules = closeRules;

// Start
init();
