// app.ts
var PIECES = {
  white: { pawn: "♙", knight: "♘", bishop: "♗", rook: "♖", queen: "♕", king: "♔" },
  black: { pawn: "♟", knight: "♞", bishop: "♝", rook: "♜", queen: "♛", king: "♚" }
};
var PIECE_TYPES = ["pawn", "knight", "bishop", "rook", "queen", "king"];
var COLORS = ["white", "black"];
var wasm;
var ws;
var roomCode = null;
var myColor = null;
var selectedSquare = null;
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  ws.onopen = () => {
    console.log("Connected to server");
  };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    setLobbyStatus("Connection error");
  };
  ws.onclose = () => {
    setLobbyStatus("Disconnected from server");
  };
}
function handleServerMessage(data) {
  switch (data.type) {
    case "room_created":
      roomCode = data.roomCode;
      myColor = data.color;
      enterGame();
      setLobbyStatus(`Room created: ${roomCode}`);
      break;
    case "room_joined":
      roomCode = data.roomCode;
      myColor = data.color;
      enterGame();
      document.getElementById("status").textContent = "Game started!";
      break;
    case "opponent_joined":
      document.getElementById("status").textContent = "Opponent joined! Game started.";
      updateBoard();
      break;
    case "opponent_move":
      wasm.makeMove(data.from.row, data.from.col, data.to.row, data.to.col);
      updateBoard();
      break;
    case "opponent_disconnected":
      document.getElementById("status").textContent = "Opponent disconnected";
      break;
    case "error":
      setLobbyStatus(data.message);
      break;
  }
}
function createRoom() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    setTimeout(createRoom, 100);
    return;
  }
  ws.send(JSON.stringify({ type: "create_room" }));
}
function joinRoom() {
  const input = document.getElementById("roomCode").value.trim().toUpperCase();
  if (!input) {
    setLobbyStatus("Enter a room code");
    return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    setTimeout(() => joinRoom(), 100);
    return;
  }
  ws.send(JSON.stringify({ type: "join_room", roomCode: input }));
}
function enterGame() {
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display = "block";
  document.getElementById("roomDisplay").textContent = roomCode;
  document.getElementById("colorDisplay").textContent = myColor;
  createBoard();
  updateBoard();
}
function setLobbyStatus(msg) {
  document.getElementById("lobbyStatus").textContent = msg;
}
async function init() {
  try {
    const response = await fetch("zig-out/bin/quantum-chess.wasm");
    const buffer = await response.arrayBuffer();
    const module = await WebAssembly.instantiate(buffer, { env: {} });
    wasm = module.instance.exports;
    wasm.initGame();
    connectWebSocket();
  } catch (error) {
    console.error("Failed to load WASM:", error);
    setLobbyStatus("Failed to load game. Build WASM first: zig build");
  }
}
function createBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  for (let row = 7;row >= 0; row--) {
    for (let col = 0;col < 8; col++) {
      const square = document.createElement("div");
      square.className = "square " + ((row + col) % 2 === 0 ? "dark" : "light");
      square.dataset.row = row.toString();
      square.dataset.col = col.toString();
      square.onclick = () => handleSquareClick(row, col);
      board.appendChild(square);
    }
  }
}
function updateBoard() {
  if (!myColor)
    return;
  const board = document.getElementById("board");
  const squares = board.children;
  const currentTurn = wasm.getCurrentTurn();
  const isMyTurn = COLORS[currentTurn] === myColor;
  const myColorIndex = COLORS.indexOf(myColor);
  for (let i = 0;i < 64; i++) {
    const square = squares[i];
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    square.innerHTML = "";
    square.classList.remove("selected", "valid-move", "in-check");
    const pieceData = wasm.getPieceAt(row, col, myColorIndex);
    if (pieceData !== -1) {
      const pieceType = pieceData >> 8 & 255;
      const color = pieceData & 255;
      if (COLORS[color] === myColor) {
        const pieceDiv = document.createElement("div");
        pieceDiv.className = "piece";
        pieceDiv.textContent = PIECES[COLORS[color]][PIECE_TYPES[pieceType]];
        pieceDiv.style.color = COLORS[color] === "white" ? "#f0f0f0" : "#1a1a1a";
        if (COLORS[color] === "black") {
          pieceDiv.style.webkitTextStroke = "2px #888";
        }
        square.appendChild(pieceDiv);
      }
    }
    let pieceIndex = 0;
    while (true) {
      const quantumData = wasm.getQuantumPieceAt(row, col, myColorIndex, pieceIndex);
      if (quantumData === -1)
        break;
      const pieceType = quantumData >> 16 & 255;
      const color = quantumData >> 8 & 255;
      const probability = quantumData & 255;
      const rowDiv = document.createElement("div");
      rowDiv.className = "piece-row";
      const pieceDiv = document.createElement("div");
      pieceDiv.className = "piece";
      pieceDiv.style.opacity = probability === 100 ? "1" : "0.7";
      pieceDiv.style.fontSize = "32px";
      pieceDiv.textContent = PIECES[COLORS[color]][PIECE_TYPES[pieceType]];
      pieceDiv.style.color = COLORS[color] === "white" ? "#f0f0f0" : "#1a1a1a";
      if (COLORS[color] === "black") {
        pieceDiv.style.webkitTextStroke = "2px #888";
      }
      rowDiv.appendChild(pieceDiv);
      if (probability < 100) {
        const probDiv = document.createElement("div");
        probDiv.className = "quantum-prob";
        probDiv.textContent = probability + "%";
        rowDiv.appendChild(probDiv);
      }
      square.appendChild(rowDiv);
      pieceIndex++;
    }
    if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
      square.classList.add("selected");
    }
    if (selectedSquare && isMyTurn) {
      const isValid = wasm.isValidMove(selectedSquare.row, selectedSquare.col, row, col, myColorIndex);
      if (isValid) {
        square.classList.add("valid-move");
      }
    }
  }
  document.getElementById("turnDisplay").textContent = `turn: ${COLORS[currentTurn]}`;
  const isCheck = wasm.isInCheck(myColorIndex);
  document.getElementById("checkDisplay").style.display = isCheck ? "inline" : "none";
  if (isCheck && myColor && COLORS[currentTurn] === myColor) {
    for (let i = 0;i < 64; i++) {
      const sq = squares[i];
      const r = parseInt(sq.dataset.row);
      const c = parseInt(sq.dataset.col);
      const piece = wasm.getPieceAt(r, c, myColorIndex);
      if (piece !== -1) {
        const type = piece >> 8 & 255;
        const col = piece & 255;
        if (type === 5 && COLORS[col] === myColor) {
          sq.classList.add("in-check");
          break;
        }
      }
    }
  }
}
function handleSquareClick(row, col) {
  if (!myColor)
    return;
  const currentTurn = wasm.getCurrentTurn();
  const isMyTurn = COLORS[currentTurn] === myColor;
  if (!isMyTurn) {
    document.getElementById("status").textContent = "Not your turn";
    return;
  }
  const myColorIndex = COLORS.indexOf(myColor);
  const pieceData = wasm.getPieceAt(row, col, myColorIndex);
  if (selectedSquare) {
    const success = wasm.makeMove(selectedSquare.row, selectedSquare.col, row, col);
    if (success) {
      ws.send(JSON.stringify({
        type: "move",
        from: { row: selectedSquare.row, col: selectedSquare.col },
        to: { row, col }
      }));
      selectedSquare = null;
      updateBoard();
      document.getElementById("status").textContent = "Opponent's turn";
    } else {
      if (pieceData !== -1) {
        const color = pieceData & 255;
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
    if (pieceData !== -1) {
      const color = pieceData & 255;
      if (COLORS[color] === myColor) {
        selectedSquare = { row, col };
        updateBoard();
        document.getElementById("status").textContent = "Select destination";
      }
    }
  }
}
function openRules() {
  document.getElementById("rulesModal").style.display = "flex";
}
function closeRules(event) {
  if (!event || event.target.id === "rulesModal") {
    document.getElementById("rulesModal").style.display = "none";
  }
}
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.openRules = openRules;
window.closeRules = closeRules;
init();
