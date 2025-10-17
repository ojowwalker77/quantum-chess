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
            document.getElementById('status')!.textContent = 'Game started!';
            break;

        case 'opponent_joined':
            document.getElementById('status')!.textContent = 'Opponent joined! Game started.';
            updateBoard();
            break;

        case 'opponent_move':
            // Apply opponent's move
            wasm.makeMove(data.from!.row, data.from!.col, data.to!.row, data.to!.col);
            updateBoard();
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
        const response = await fetch('zig-out/bin/quantum-chess.wasm');
        const buffer = await response.arrayBuffer();
        const module = await WebAssembly.instantiate(buffer, { env: {} });
        wasm = module.instance.exports as WasmExports;
        wasm.initGame();
        connectWebSocket();
    } catch (error) {
        console.error('Failed to load WASM:', error);
        setLobbyStatus('Failed to load game. Build WASM first: zig build');
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
    if (!myColor) return;

    const board = document.getElementById('board')!;
    const squares = board.children;
    const currentTurn = wasm.getCurrentTurn();
    const isMyTurn = COLORS[currentTurn] === myColor;
    const myColorIndex = COLORS.indexOf(myColor);

    for (let i = 0; i < 64; i++) {
        const square = squares[i] as HTMLElement;
        const row = parseInt(square.dataset.row!);
        const col = parseInt(square.dataset.col!);

        square.innerHTML = '';
        square.classList.remove('selected', 'valid-move', 'in-check');

        // Get piece from WASM (my view - my own pieces)
        const pieceData = wasm.getPieceAt(row, col, myColorIndex);

        if (pieceData !== -1) {
            const pieceType = (pieceData >> 8) & 0xFF;
            const color = pieceData & 0xFF;

            // Show my pieces clearly
            if (COLORS[color] === myColor) {
                const pieceDiv = document.createElement('div');
                pieceDiv.className = 'piece';
                pieceDiv.textContent = PIECES[COLORS[color]][PIECE_TYPES[pieceType]];
                pieceDiv.style.color = COLORS[color] === 'white' ? '#f0f0f0' : '#1a1a1a';
                if (COLORS[color] === 'black') {
                    pieceDiv.style.webkitTextStroke = '2px #888';
                }
                square.appendChild(pieceDiv);
            }
        }

        // Show opponent quantum pieces (can be multiple per square)
        let pieceIndex = 0;
        while (true) {
            const quantumData = wasm.getQuantumPieceAt(row, col, myColorIndex, pieceIndex);
            if (quantumData === -1) break;

            const pieceType = (quantumData >> 16) & 0xFF;
            const color = (quantumData >> 8) & 0xFF;
            const probability = quantumData & 0xFF;

            const rowDiv = document.createElement('div');
            rowDiv.className = 'piece-row';

            const pieceDiv = document.createElement('div');
            pieceDiv.className = 'piece';
            pieceDiv.style.opacity = probability === 100 ? '1' : '0.7';
            pieceDiv.style.fontSize = '32px';
            pieceDiv.textContent = PIECES[COLORS[color]][PIECE_TYPES[pieceType]];
            pieceDiv.style.color = COLORS[color] === 'white' ? '#f0f0f0' : '#1a1a1a';
            if (COLORS[color] === 'black') {
                pieceDiv.style.webkitTextStroke = '2px #888';
            }

            rowDiv.appendChild(pieceDiv);

            if (probability < 100) {
                const probDiv = document.createElement('div');
                probDiv.className = 'quantum-prob';
                probDiv.textContent = probability + '%';
                rowDiv.appendChild(probDiv);
            }

            square.appendChild(rowDiv);
            pieceIndex++;
        }

        // Highlight selected square
        if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
            square.classList.add('selected');
        }

        // Show valid moves
        if (selectedSquare && isMyTurn) {
            const isValid = wasm.isValidMove(selectedSquare.row, selectedSquare.col, row, col, myColorIndex);
            if (isValid) {
                square.classList.add('valid-move');
            }
        }
    }

    // Update turn display
    document.getElementById('turnDisplay')!.textContent = `turn: ${COLORS[currentTurn]}`;

    // Check indicator
    const isCheck = wasm.isInCheck(myColorIndex);
    document.getElementById('checkDisplay')!.style.display = isCheck ? 'inline' : 'none';

    // Highlight king in check
    if (isCheck && myColor && COLORS[currentTurn] === myColor) {
        for (let i = 0; i < 64; i++) {
            const sq = squares[i] as HTMLElement;
            const r = parseInt(sq.dataset.row!);
            const c = parseInt(sq.dataset.col!);
            const piece = wasm.getPieceAt(r, c, myColorIndex);
            if (piece !== -1) {
                const type = (piece >> 8) & 0xFF;
                const col = piece & 0xFF;
                if (type === 5 && COLORS[col] === myColor) {
                    sq.classList.add('in-check');
                    break;
                }
            }
        }
    }
}

function handleSquareClick(row: number, col: number): void {
    if (!myColor) return;

    const currentTurn = wasm.getCurrentTurn();
    const isMyTurn = COLORS[currentTurn] === myColor;

    if (!isMyTurn) {
        document.getElementById('status')!.textContent = 'Not your turn';
        return;
    }

    const myColorIndex = COLORS.indexOf(myColor);
    const pieceData = wasm.getPieceAt(row, col, myColorIndex);

    if (selectedSquare) {
        // Try to make a move
        const success = wasm.makeMove(selectedSquare.row, selectedSquare.col, row, col);

        if (success) {
            // Send move to opponent
            ws.send(JSON.stringify({
                type: 'move',
                from: { row: selectedSquare.row, col: selectedSquare.col },
                to: { row, col }
            }));

            selectedSquare = null;
            updateBoard();
            document.getElementById('status')!.textContent = "Opponent's turn";
        } else {
            // Try selecting new piece
            if (pieceData !== -1) {
                const color = pieceData & 0xFF;
                if (COLORS[color] === myColor) {
                    selectedSquare = { row, col };
                    updateBoard();
                }
            } else {
                selectedSquare = null;
                updateBoard();
            }
        }
    } else {
        // Select a piece
        if (pieceData !== -1) {
            const color = pieceData & 0xFF;
            if (COLORS[color] === myColor) {
                selectedSquare = { row, col };
                updateBoard();
                document.getElementById('status')!.textContent = 'Select destination';
            }
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
