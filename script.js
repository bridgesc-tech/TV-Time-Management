class TicTacToeCardGame {
    constructor() {
        this.board = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
        this.currentPlayer = 'green'; // 'green' or 'red'
        this.gameMode = null;
        this.gameActive = false;
        this.player1Ready = false; // For online multiplayer ready status
        this.player2Ready = false; // For online multiplayer ready status
        this.scores = { green: 0, red: 0, draws: 0 };
        this.winningCombinations = [
            // Rows
            [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
            // Columns
            [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
            // Diagonals
            [0, 5, 10, 15], [3, 6, 9, 12]
        ];
        
        // Card deck management
        this.playerDecks = {
            green: this.createDeck('green'),
            red: this.createDeck('red')
        };
        
        this.draggedCard = null;
        this.selectedCard = null; // For mobile touch support
        
        // Track which tiles have been replaced (locked tiles)
        this.replacedTiles = new Set();
        
        // Store cell colors for online multiplayer
        this.storedCellColors = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
        
        // Firebase online multiplayer
        this.gameRoomId = null;
        this.myPlayerColor = null; // 'green' or 'red' - determines which player I am
        this.myPlayerName = 'Player'; // Player's name
        this.opponentName = 'Opponent'; // Opponent's name
        this.firebaseEnabled = false;
        this.gameUnsubscribe = null; // Firebase listener unsubscribe function
        this.gameResult = null; // Store game result (win/draw) for syncing
        this.receivedEmote = null; // Store emote received from opponent
        this.myEmote = null; // Store emote I sent
        this.isLoadingFromFirebase = false; // Flag to prevent recursive Firebase loads
        
        this.initializeEventListeners();
        this.updateDisplay();
        this.checkFirebase();
    }

    checkFirebase() {
        // Wait for Firebase to be ready
        const checkFirebase = () => {
            if (typeof db !== 'undefined' && db !== null) {
                this.firebaseEnabled = true;
                console.log('Firebase ready for TicTacToe');
            } else {
                setTimeout(checkFirebase, 100);
            }
        };
        checkFirebase();
    }

    createDeck(color) {
        const deck = [];
        // Each player gets 2 copies of numbers 1-5
        for (let i = 1; i <= 5; i++) {
            deck.push({ number: i, color: color, used: false, id: `${color}-${i}-1` });
            deck.push({ number: i, color: color, used: false, id: `${color}-${i}-2` });
        }
        return deck;
    }

    initializeEventListeners() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.addEventListener('dragover', (e) => this.handleDragOver(e));
            cell.addEventListener('drop', (e) => this.handleDrop(e));
            cell.addEventListener('dragenter', (e) => this.handleDragEnter(e));
            cell.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            
            // Touch support for mobile
            cell.addEventListener('touchstart', (e) => this.handleCellTouchStart(e));
            cell.addEventListener('touchend', (e) => this.handleCellTouchEnd(e));
        });
    }

    startGame(mode) {
        this.gameMode = mode;
        
        // Close any open modals first
        document.getElementById('gameRoomModal').style.display = 'none';
        document.getElementById('waitingRoomModal').style.display = 'none';
        
        // Online mode is now handled by Firebase game rooms via showGameRoomModal()
        // For backwards compatibility, still check URL for old-style game states
        if (mode === 'online') {
            const urlParams = new URLSearchParams(window.location.search);
            const gameState = urlParams.get('state');
            
            if (gameState) {
                // Load existing game from URL (legacy support)
                this.loadGameFromURL(gameState);
                return;
            }
            // If no URL state, online mode should have been triggered via modal
            // Just return and let modal handle it
                return;
        }
        
        // Show coin flip for AI and local multiplayer
        document.getElementById('gameModeSelection').style.display = 'none';
        document.getElementById('coinFlipContainer').style.display = 'block';
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('gameResult').style.display = 'none';
        
        this.performCoinFlip();
    }

    performCoinFlip() {
        const coin = document.getElementById('coin');
        const coinResult = document.getElementById('coinResult');
        const coinResultText = document.getElementById('coinResultText');
        
        // Hide result initially
        coinResult.style.display = 'none';
        
        // Randomly determine winner first
        const randomValue = Math.random();
        const winner = randomValue < 0.5 ? 'green' : 'red';
        this.coinFlipWinner = winner;
        
        console.log(`Coin flip - Random value: ${randomValue}, Winner: ${winner}`);
        
        // Start JavaScript animation
        this.animateCoinFlip(coin, winner, coinResult, coinResultText);
    }

    animateCoinFlip(coin, winner, coinResult, coinResultText) {
        // Start CSS animation
        coin.classList.add('flipping');
        
        // Show result after animation completes
        setTimeout(() => {
            // Stop animation
            coin.classList.remove('flipping');
            
            // Set final position based on winner
            const coinGreen = document.getElementById('coinGreen');
            const coinRed = document.getElementById('coinRed');
            
            if (winner === 'green') {
                coinGreen.style.transform = 'rotateY(0deg)';
                coinRed.style.transform = 'rotateY(180deg)';
            } else {
                coinGreen.style.transform = 'rotateY(180deg)';
                coinRed.style.transform = 'rotateY(0deg)';
            }
            
            // Show result based on game mode
            let winnerText;
            if (this.gameMode === 'multiplayer') {
                winnerText = winner === 'green' ? 'Player 1 goes first!' : 'Player 2 goes first!';
            } else {
                winnerText = winner === 'green' ? 'You go first!' : 'Opponent goes first!';
            }
            coinResultText.textContent = winnerText;
            coinResult.style.display = 'block';
        }, 2000); // Match CSS animation duration
    }

    proceedToGame() {
        // Close any open modals
        document.getElementById('gameRoomModal').style.display = 'none';
        document.getElementById('waitingRoomModal').style.display = 'none';
        
        this.resetBoard();
        this.gameActive = true;
        
        // Set the starting player based on coin flip AFTER resetBoard
        this.currentPlayer = this.coinFlipWinner;
        
        document.getElementById('coinFlipContainer').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        
        this.updateCurrentPlayerDisplay();
        this.updatePlayerDeck();
        
    }

    resetBoard() {
        console.log('resetBoard() called - resetting board array');
        this.board = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
        this.currentPlayer = 'green';
        this.gameActive = true;
        this.gameResult = null; // Clear any previous game result
        this.myEmote = null; // Clear emotes
        this.receivedEmote = null;
        this.player1Ready = false; // Reset ready status
        this.player2Ready = false; // Reset ready status
        
        // Clear emote display
        const myEmoteDisplay = document.getElementById('myEmoteDisplay');
        const receivedEmoteDisplay = document.getElementById('receivedEmoteDisplay');
        if (myEmoteDisplay) {
            myEmoteDisplay.textContent = '';
        }
        if (receivedEmoteDisplay) {
            receivedEmoteDisplay.textContent = '';
        }
        
        // Reset decks
        this.playerDecks.green = this.createDeck('green');
        this.playerDecks.red = this.createDeck('red');
        
        // Reset selected card
        this.selectedCard = null;
        
        // Reset replaced tiles tracking
        this.replacedTiles.clear();
        
        // Reset stored cell colors
        this.storedCellColors = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
        
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.textContent = '';
            cell.className = 'cell';
            cell.classList.remove('winning'); // Remove winning highlights
        });
        
        this.updateCurrentPlayerDisplay();
        this.updatePlayerDeck();
    }

    updatePlayerDeck() {
        // Update Player 1 (Green) deck
        const player1Container = document.getElementById('player1DeckContainer');
        const player1Label = document.querySelector('#player1Deck h3');
        
        // Update player name label for online mode
        if (this.gameMode === 'online' && player1Label) {
            const greenPlayerName = this.myPlayerColor === 'green' ? this.myPlayerName : this.opponentName;
            player1Label.textContent = `${greenPlayerName}'s Cards`;
        } else if (player1Label && this.gameMode !== 'online') {
            player1Label.textContent = 'Player 1 Cards';
        }
        
        player1Container.innerHTML = '';
        
        const greenDeck = this.playerDecks.green;
        greenDeck.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.className = `card ${card.color}`;
            cardElement.textContent = card.number;
            cardElement.dataset.cardId = card.id;
            
            if (card.used) {
                // Mark used cards as disabled and non-draggable
                cardElement.classList.add('used');
                cardElement.draggable = false;
                cardElement.style.opacity = '0.3';
                cardElement.style.cursor = 'not-allowed';
            } else {
                // Available cards are draggable only on current player's turn
                // In online mode, also check if it's our turn
                const canDrag = this.currentPlayer === 'green' && 
                               (this.gameMode !== 'online' || this.currentPlayer === this.myPlayerColor);
                cardElement.draggable = canDrag;
                if (canDrag) {
                cardElement.addEventListener('dragstart', (e) => this.handleDragStart(e));
                cardElement.addEventListener('dragend', (e) => this.handleDragEnd(e));
                // Touch support for mobile
                cardElement.addEventListener('touchend', (e) => this.handleCardTouch(e, card));
                } else {
                    cardElement.style.opacity = '0.6';
                    cardElement.style.cursor = 'not-allowed';
                }
            }
            
            player1Container.appendChild(cardElement);
        });
        
        // Update Player 2/AI (Red) deck
        const player2Container = document.getElementById('player2DeckContainer');
        const player2Label = document.querySelector('#player2Deck h3');
        
        // Update player name label for online mode
        if (this.gameMode === 'online' && player2Label) {
            const redPlayerName = this.myPlayerColor === 'red' ? this.myPlayerName : this.opponentName;
            player2Label.textContent = `${redPlayerName}'s Cards`;
        } else if (player2Label && this.gameMode === 'multiplayer') {
            player2Label.textContent = 'Player 2 Cards';
        }
        
        player2Container.innerHTML = '';
        
        const redDeck = this.playerDecks.red;
        redDeck.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.className = `card ${card.color}`;
            cardElement.textContent = card.number;
            cardElement.dataset.cardId = card.id;
            
            if (card.used) {
                // Mark used cards as disabled and non-draggable
                cardElement.classList.add('used');
                cardElement.draggable = false;
                cardElement.style.opacity = '0.3';
                cardElement.style.cursor = 'not-allowed';
            } else {
                // Available cards are draggable only on current player's turn
                // In online mode, also check if it's our turn
                const canDrag = this.currentPlayer === 'red' && 
                               (this.gameMode !== 'online' || this.currentPlayer === this.myPlayerColor);
                cardElement.draggable = canDrag;
                if (canDrag) {
                cardElement.addEventListener('dragstart', (e) => this.handleDragStart(e));
                cardElement.addEventListener('dragend', (e) => this.handleDragEnd(e));
                // Touch support for mobile
                cardElement.addEventListener('touchend', (e) => this.handleCardTouch(e, card));
                } else {
                    cardElement.style.opacity = '0.6';
                    cardElement.style.cursor = 'not-allowed';
                }
            }
            
            player2Container.appendChild(cardElement);
        });
    }

    handleDragStart(e) {
        if (!this.gameActive) {
            e.preventDefault();
            return;
        }
        
        // Only allow dragging if it's the current player's turn
        const cardColor = e.target.classList.contains('green') ? 'green' : 'red';
        if (cardColor !== this.currentPlayer) {
            e.preventDefault();
            return;
        }
        
        this.draggedCard = e.target.dataset.cardId;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        this.draggedCard = null;
    }

    // Mobile touch support methods
    handleCardTouch(e, card) {
        e.preventDefault();
        e.stopPropagation();
        
        if (!this.gameActive) return;
        
        // Only allow selection if it's the current player's turn
        const cardColor = card.color;
        if (cardColor !== this.currentPlayer || card.used) {
            return;
        }
        
        // Toggle card selection
        if (this.selectedCard && this.selectedCard.id === card.id) {
            // Deselect if clicking the same card
            this.selectedCard = null;
            this.updateCardSelection();
        } else {
            // Select new card
            this.selectedCard = card;
            this.updateCardSelection();
        }
    }

    handleCellTouchStart(e) {
        // Prevent default behavior
        e.preventDefault();
    }

    handleCellTouchEnd(e) {
        e.preventDefault();
        
        if (!this.gameActive || !this.selectedCard) return;
        
        // Find the cell element
        let cellElement = e.target;
        while (cellElement && !cellElement.classList.contains('cell')) {
            cellElement = cellElement.parentElement;
        }
        
        if (!cellElement) return;
        
        const cellIndex = parseInt(cellElement.dataset.index);
        
        // Check if valid placement
        const card = this.selectedCard;
        const currentPiece = this.board[cellIndex];
        
        // Can't place on locked tiles
        if (this.replacedTiles.has(cellIndex)) {
            this.selectedCard = null;
            this.updateCardSelection();
            return;
        }
        
        if (currentPiece === '') {
            // Empty cell - can place
            this.makeMove(cellIndex, card);
            this.selectedCard = null;
            this.updateCardSelection();
        } else if (typeof currentPiece === 'number') {
            const currentColor = this.getCellColor(cellIndex);
            if (currentColor !== this.currentPlayer && card.number > currentPiece) {
                // Can overwrite enemy piece
                this.makeMove(cellIndex, card);
                this.selectedCard = null;
                this.updateCardSelection();
            }
        }
    }

    updateCardSelection() {
        // Update visual feedback for selected card
        const cards = document.querySelectorAll('.card');
        cards.forEach(cardElement => {
            const cardId = cardElement.dataset.cardId;
            const card = this.findCardById(cardId);
            
            if (this.selectedCard && cardId === this.selectedCard.id) {
                cardElement.classList.add('selected');
                cardElement.style.transform = 'scale(1.15)';
                cardElement.style.borderColor = '#667eea';
                cardElement.style.borderWidth = '4px';
            } else {
                cardElement.classList.remove('selected');
                cardElement.style.transform = '';
                cardElement.style.borderColor = '';
                cardElement.style.borderWidth = '';
            }
        });
    }

    handleDragOver(e) {
        if (!this.gameActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        if (!this.gameActive) return;
        e.preventDefault();
        
        // Find the cell element (in case we're hovering over a child element like span)
        let cellElement = e.target;
        while (cellElement && !cellElement.classList.contains('cell')) {
            cellElement = cellElement.parentElement;
        }
        
        if (!cellElement) return;
        
        const cellIndex = parseInt(cellElement.dataset.index);
        const cardId = this.draggedCard;
        const card = this.findCardById(cardId);
        
        if (!card || card.used || card.color !== this.currentPlayer) return;
        
        // Check if we can place the card here
        const currentPiece = this.board[cellIndex];
        let canPlace = false;
        let canOverwrite = false;
        
        // Can't place on locked tiles (tiles that have been replaced)
        if (this.replacedTiles.has(cellIndex)) {
            return; // Can't place on locked tiles
        }
        
        if (currentPiece === '') {
            canPlace = true;
        } else if (typeof currentPiece === 'number') {
            const currentColor = this.getCellColor(cellIndex);
            
            if (currentColor !== this.currentPlayer && card.number > currentPiece) {
                canPlace = true;
                canOverwrite = true;
            }
        }
        
        if (canPlace) {
            cellElement.classList.add('drag-over');
            if (canOverwrite) {
                cellElement.classList.add('can-overwrite');
            }
        }
    }

    handleDragLeave(e) {
        // Find the cell element (in case we're leaving a child element like span)
        let cellElement = e.target;
        while (cellElement && !cellElement.classList.contains('cell')) {
            cellElement = cellElement.parentElement;
        }
        
        if (cellElement) {
            cellElement.classList.remove('drag-over', 'can-overwrite');
        }
    }

    handleDrop(e) {
        if (!this.gameActive) return;
        
        e.preventDefault();
        
        // Find the cell element (in case we dropped on a child element like span)
        let cellElement = e.target;
        while (cellElement && !cellElement.classList.contains('cell')) {
            cellElement = cellElement.parentElement;
        }
        
        if (!cellElement) {
            console.error('handleDrop - Could not find cell element');
            return;
        }
        
        cellElement.classList.remove('drag-over', 'can-overwrite');
        
        const cellIndex = parseInt(cellElement.dataset.index);
        const cardId = this.draggedCard;
        const card = this.findCardById(cardId);
        
        console.log('handleDrop - e.target:', e.target);
        console.log('handleDrop - cellElement:', cellElement);
        console.log('handleDrop - dataset.index:', cellElement.dataset.index);
        console.log('handleDrop - cellIndex:', cellIndex);
        console.log('handleDrop - cardId:', cardId);
        console.log('handleDrop - card:', card);
        
        // Validate cell index
        if (isNaN(cellIndex) || cellIndex < 0 || cellIndex > 15) {
            console.error('handleDrop - Invalid cell index:', cellIndex);
            return;
        }
        
        if (!card || card.used || card.color !== this.currentPlayer) {
            console.log('handleDrop - Invalid card or not current player');
            return;
        }
        
        // Check if we can place the card (empty cell or overwriting with higher number)
        const currentPiece = this.board[cellIndex];
        
        // Can't place on locked tiles (tiles that have been replaced)
        if (this.replacedTiles.has(cellIndex)) {
            console.log('handleDrop - Cannot place on locked tile');
            return;
        }
        
        if (currentPiece !== '' && typeof currentPiece === 'number') {
            // There's already a piece here, check if we can overwrite it
            const currentColor = this.getCellColor(cellIndex);
            
            // Can only overwrite enemy pieces, and only with higher numbers
            if (currentColor === this.currentPlayer || card.number <= currentPiece) {
                return; // Can't overwrite
            }
        }
        
        this.makeMove(cellIndex, card);
    }

    findCardById(cardId) {
        for (let color in this.playerDecks) {
            const card = this.playerDecks[color].find(c => c.id === cardId);
            if (card) return card;
        }
        return null;
    }

    makeMove(index, card) {
        if (!this.gameActive) return;

        // For online mode, check if it's our turn
        if (this.gameMode === 'online' && this.currentPlayer !== this.myPlayerColor) {
            return; // Not our turn
        }
        
        console.log(`makeMove(${index}, ${card.number}, ${card.color}) - Before: board[${index}] = ${this.board[index]}`);
        
        // Check if we're overwriting an enemy piece
        const isOverwriting = this.board[index] !== '';
        const previousPiece = this.board[index];
        
        // Track if this tile has been replaced before
        if (isOverwriting) {
            this.replacedTiles.add(index);
        }
        
        this.board[index] = card.number;
        card.used = true;
        
        console.log(`makeMove(${index}, ${card.number}, ${card.color}) - After: board[${index}] = ${this.board[index]}`);
        console.log(`makeMove - Full board state:`, [...this.board]);
        
        const cell = document.querySelector(`[data-index="${index}"]`);
        
        // Validate that we found the cell element
        if (!cell) {
            console.error(`makeMove - Could not find cell with index ${index}`);
            return;
        }
        
        // Add overwrite animation if we're replacing a piece
        if (isOverwriting) {
            cell.classList.add('overwriting');
            setTimeout(() => {
                cell.classList.remove('overwriting');
            }, 300);
        }
        
        cell.innerHTML = `<span class="number">${card.number}</span>`;
        cell.className = `cell ${card.color}`; // Reset classes and add new color
        
        // Store the cell color for online multiplayer
        this.storedCellColors[index] = card.color;
        
        // Add locked class if this tile has been replaced
        if (this.replacedTiles.has(index)) {
            cell.classList.add('locked');
        }
        
        const winResult = this.checkWin();
        if (winResult) {
            this.endGame(winResult);
            // Sync final state
            if (this.gameMode === 'online' && this.firebaseEnabled) {
                this.syncGameStateToFirebase();
            }
            return;
        }
        
        if (this.checkDraw()) {
            this.endGame('draw');
            if (this.gameMode === 'online' && this.firebaseEnabled) {
                this.syncGameStateToFirebase();
            }
            return;
        }
        
        // Check for automatic draw when both players run out of playable cards
        if (this.checkAutomaticDraw()) {
            this.endGame('draw');
            if (this.gameMode === 'online' && this.firebaseEnabled) {
                this.syncGameStateToFirebase();
            }
            return;
        }
        
        this.switchPlayer();
        this.updateCurrentPlayerDisplay();
        this.updatePlayerDeck();
        
        // Sync to Firebase for online mode
        if (this.gameMode === 'online' && this.firebaseEnabled) {
            this.syncGameStateToFirebase();
        }
        
    }

    // AI functions removed - AI mode no longer supported

    canPlaceCard(index, card) {
        const currentPiece = this.board[index];
        const currentColor = this.getCellColor(index);
        
        console.log(`canPlaceCard(${index}, ${card.number}): board[${index}]=${currentPiece}, color=${currentColor}, currentPlayer=${this.currentPlayer}`);
        
        // Can't place on locked tiles (tiles that have been replaced)
        if (this.replacedTiles.has(index)) {
            console.log(`  -> Locked tile, denying placement`);
            return false;
        }
        
        if (currentPiece === '') {
            console.log(`  -> Empty cell, allowing placement`);
            return true; // Empty cell
        }
        
        if (typeof currentPiece === 'number') {
            const canOverwrite = currentColor !== this.currentPlayer && card.number > currentPiece;
            console.log(`  -> Can overwrite: ${canOverwrite} (color different: ${currentColor !== this.currentPlayer}, higher number: ${card.number > currentPiece})`);
            return canOverwrite;
        }
        
        console.log(`  -> Not a number, denying placement`);
        return false;
    }

    getCellColor(index) {
        const cell = document.querySelector(`[data-index="${index}"]`);
        if (!cell) return '';
        if (cell.classList.contains('green')) return 'green';
        if (cell.classList.contains('red')) return 'red';
        return '';
    }

    setCellColor(index, color) {
        const cell = document.querySelector(`[data-index="${index}"]`);
        if (!cell) return;
        cell.className = `cell ${color}`;
    }


    evaluateBoard() {
        // Check for immediate win
        const winResult = this.checkWin();
        if (winResult === 'red') return 100;
        if (winResult === 'green') return -100;
        
        // Heuristic: prefer center and corners
        let score = 0;
        const centerPositions = [5, 6, 9, 10]; // Center 4 positions in 4x4
        centerPositions.forEach(pos => {
            if (this.board[pos] && typeof this.board[pos] === 'number') {
                score += 10;
            }
        });
        
        const corners = [0, 3, 12, 15]; // Corners in 4x4
        corners.forEach(index => {
            if (this.board[index] && typeof this.board[index] === 'number') {
                score += 5;
            }
        });
        
        return score;
    }


    switchPlayer() {
        this.currentPlayer = this.currentPlayer === 'green' ? 'red' : 'green';
    }

    checkWin() {
        for (let combination of this.winningCombinations) {
            const [a, b, c, d] = combination;
            if (this.board[a] && this.board[b] && this.board[c] && this.board[d]) {
                // Check if all four cells have the same color
                const cellA = document.querySelector(`[data-index="${a}"]`);
                const cellB = document.querySelector(`[data-index="${b}"]`);
                const cellC = document.querySelector(`[data-index="${c}"]`);
                const cellD = document.querySelector(`[data-index="${d}"]`);
                
                if (cellA.classList.contains('green') && cellB.classList.contains('green') && cellC.classList.contains('green') && cellD.classList.contains('green')) {
                    this.highlightWinningCells(combination);
                    return 'green';
                }
                if (cellA.classList.contains('red') && cellB.classList.contains('red') && cellC.classList.contains('red') && cellD.classList.contains('red')) {
                    this.highlightWinningCells(combination);
                    return 'red';
                }
            }
        }
        return false;
    }

    checkWinForSimulation() {
        // Same as checkWin but without highlighting (for AI simulation)
        for (let combination of this.winningCombinations) {
            const [a, b, c, d] = combination;
            if (this.board[a] && this.board[b] && this.board[c] && this.board[d]) {
                const cellA = document.querySelector(`[data-index="${a}"]`);
                const cellB = document.querySelector(`[data-index="${b}"]`);
                const cellC = document.querySelector(`[data-index="${c}"]`);
                const cellD = document.querySelector(`[data-index="${d}"]`);
                
                if (cellA.classList.contains('green') && cellB.classList.contains('green') && cellC.classList.contains('green') && cellD.classList.contains('green')) {
                    return 'green';
                }
                if (cellA.classList.contains('red') && cellB.classList.contains('red') && cellC.classList.contains('red') && cellD.classList.contains('red')) {
                    return 'red';
                }
            }
        }
        return false;
    }

    highlightWinningCells(combination) {
        combination.forEach(index => {
            const cell = document.querySelector(`[data-index="${index}"]`);
            cell.classList.add('winning');
        });
    }

    checkDraw() {
        return this.board.every(cell => cell !== '');
    }

    hasPlayableCards(playerColor) {
        const availableCards = this.playerDecks[playerColor].filter(card => !card.used);
        
        // Check if any available card can be placed on any empty cell or can overwrite an enemy piece
        for (let card of availableCards) {
            for (let i = 0; i < 16; i++) {
                if (this.canPlaceCard(i, card)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    checkAutomaticDraw() {
        const greenHasPlayableCards = this.hasPlayableCards('green');
        const redHasPlayableCards = this.hasPlayableCards('red');
        
        // If both players have no playable cards, it's an automatic draw
        if (!greenHasPlayableCards && !redHasPlayableCards) {
            return true;
        }
        
        return false;
    }

    endGame(result) {
        this.gameActive = false;
        
        // Reset ready status when game ends (for online multiplayer)
        this.player1Ready = false;
        this.player2Ready = false;
        
        if (result === 'draw') {
            this.scores.draws++;
            // Check if it's an automatic draw due to no playable cards
            if (this.checkAutomaticDraw()) {
                this.gameResult = { type: 'draw', message: 'Automatic Draw! Both players ran out of playable cards! 🤝' };
                this.showResult(this.gameResult.message);
            } else {
                this.gameResult = { type: 'draw', message: 'It\'s a Draw! 🤝' };
                this.showResult(this.gameResult.message);
            }
        } else {
            this.scores[result]++;
            let winnerName;
            if (this.gameMode === 'online') {
                // For online, show if you won or lost using names
                const isWinner = result === this.myPlayerColor;
                if (isWinner) {
                    winnerName = 'You';
                } else {
                    // Opponent won - opponentName is always the other player's name
                    winnerName = this.opponentName || 'Opponent';
                }
            } else {
                winnerName = `Player ${result === 'green' ? '1' : '2'}`;
            }
            this.gameResult = { type: 'win', winner: result, message: `${winnerName} Wins! 🎉` };
            this.showResult(this.gameResult.message);
        }
        
        this.updateScoreDisplay();
        
        // Sync to Firebase for online mode
        if (this.gameMode === 'online' && this.firebaseEnabled) {
            this.syncGameStateToFirebase();
        }
    }

    showResult(message) {
        document.getElementById('resultMessage').textContent = message;
        document.getElementById('gameResult').style.display = 'flex';
        
        // Show emote section only for online multiplayer
        const emoteSection = document.getElementById('emoteSection');
        
        // Update ready status display for online multiplayer
        if (this.gameMode === 'online' && !this.gameActive) {
            // Use setTimeout to ensure DOM is updated first
            setTimeout(() => {
                this.updateReadyStatusDisplay();
                this.updateEmoteDisplay(); // Also update emote display when showing result
            }, 100);
        }
        if (emoteSection) {
            if (this.gameMode === 'online') {
                emoteSection.style.display = 'block';
            } else {
                emoteSection.style.display = 'none';
            }
        }
    }

    updateCurrentPlayerDisplay() {
        const playerColorIndicator = document.getElementById('playerColorIndicator');
        const playerName = document.getElementById('playerName');
        
        playerColorIndicator.className = `player-color-indicator ${this.currentPlayer}`;
        
        if (this.gameMode === 'online') {
            // Show which player's turn using names
            if (this.myPlayerColor) {
                const isMyTurn = this.currentPlayer === this.myPlayerColor;
                const currentPlayerName = this.currentPlayer === 'green' 
                    ? (this.myPlayerColor === 'green' ? this.myPlayerName : this.opponentName)
                    : (this.myPlayerColor === 'red' ? this.myPlayerName : this.opponentName);
                
                if (isMyTurn) {
                    playerName.textContent = `Your Turn`;
                } else {
                    playerName.textContent = `${currentPlayerName}'s Turn`;
                }
            } else {
            playerName.textContent = `${this.currentPlayer === 'green' ? 'Green' : 'Red'} Player's Turn`;
            }
        } else {
            playerName.textContent = `Player ${this.currentPlayer === 'green' ? '1' : '2'}'s Turn`;
        }
    }

    updateScoreDisplay() {
        document.getElementById('playerWins').textContent = this.scores.green;
        document.getElementById('opponentWins').textContent = this.scores.red;
        document.getElementById('draws').textContent = this.scores.draws;
        
        // Update scoreboard labels with player names for online mode
        const playerWinsLabel = document.querySelector('.game-stats .stat:nth-child(1) .stat-label');
        const opponentWinsLabel = document.querySelector('.game-stats .stat:nth-child(3) .stat-label');
        
        if (playerWinsLabel && opponentWinsLabel) {
            if (this.gameMode === 'online') {
                // Green player label (top)
                const greenPlayerName = this.myPlayerColor === 'green' ? this.myPlayerName : this.opponentName;
                playerWinsLabel.textContent = `${greenPlayerName} Wins:`;
                
                // Red player label (bottom)
                const redPlayerName = this.myPlayerColor === 'red' ? this.myPlayerName : this.opponentName;
                opponentWinsLabel.textContent = `${redPlayerName} Wins:`;
            } else {
                playerWinsLabel.textContent = 'Player Wins:';
                opponentWinsLabel.textContent = 'Player2 Wins:';
            }
        }
    }

    updateDisplay() {
        this.updateScoreDisplay();
    }

    resetGame() {
        // For online multiplayer, require both players to click "Play Again"
        if (this.gameMode === 'online') {
            // Mark this player as ready
            if (this.myPlayerColor === 'green') {
                this.player1Ready = true;
            } else {
                this.player2Ready = true;
            }
            
            // Check if both players are ready
            const bothReady = this.player1Ready && this.player2Ready;
            
            // Sync ready status to Firebase
            this.syncGameStateToFirebase();
            this.updateReadyStatusDisplay();
            
            // If both players are ready, start the new game
            if (bothReady) {
                // Reset the game state
                this.resetBoard();
                this.gameActive = true;
                this.gameResult = null;
                this.player1Ready = false; // Reset ready status
                this.player2Ready = false; // Reset ready status
                
                // Deterministically determine starting player (alternate based on scores to be fair)
                // If scores are equal, randomly pick; otherwise alternate
                const totalGames = this.scores.green + this.scores.red + this.scores.draws;
                this.currentPlayer = (totalGames % 2 === 0) ? 'green' : 'red';
                
                // Hide result screen, show game
                document.getElementById('gameResult').style.display = 'none';
                document.getElementById('gameContainer').style.display = 'block';
                
                // Sync new game state to Firebase
                this.syncGameStateToFirebase();
                
                // Update display
                this.updateCurrentPlayerDisplay();
                this.updatePlayerDeck();
            }
            // If not both ready, the ready status display will show who is waiting
        } else {
            // For AI and local multiplayer, show coin flip
        document.getElementById('gameResult').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('coinFlipContainer').style.display = 'block';
        
        this.performCoinFlip();
        }
    }
    
    updateReadyStatusDisplay() {
        if (this.gameMode !== 'online' || this.gameActive) return;
        
        const playAgainBtn = document.querySelector('#gameResult .control-btn[onclick="resetGame()"]');
        if (!playAgainBtn) return;
        
        // Check if we're ready
        const iAmReady = (this.myPlayerColor === 'green' && this.player1Ready) ||
                         (this.myPlayerColor === 'red' && this.player2Ready);
        const opponentReady = (this.myPlayerColor === 'green' && this.player2Ready) ||
                             (this.myPlayerColor === 'red' && this.player1Ready);
        
        // Update button text
        if (iAmReady && opponentReady) {
            playAgainBtn.textContent = 'Starting new game...';
            playAgainBtn.disabled = true;
        } else if (iAmReady) {
            playAgainBtn.textContent = 'Waiting for opponent...';
            playAgainBtn.disabled = true;
        } else {
            playAgainBtn.textContent = 'Play Again';
            playAgainBtn.disabled = false;
        }
        
        // Show status message if not both ready
        let statusMsg = document.getElementById('readyStatusMsg');
        if (!statusMsg) {
            statusMsg = document.createElement('p');
            statusMsg.id = 'readyStatusMsg';
            statusMsg.style.cssText = 'font-size: 14px; color: #7F8C8D; margin-top: 10px; text-align: center;';
            playAgainBtn.parentNode.insertBefore(statusMsg, playAgainBtn.nextSibling);
        }
        
        if (iAmReady && !opponentReady) {
            const opponentName = this.opponentName || 'Opponent';
            statusMsg.textContent = `Waiting for ${opponentName} to click "Play Again"...`;
            statusMsg.style.display = 'block';
        } else if (!iAmReady && opponentReady) {
            statusMsg.textContent = 'Your opponent is ready! Click "Play Again" to start a new game.';
            statusMsg.style.display = 'block';
        } else if (!iAmReady && !opponentReady) {
            statusMsg.style.display = 'none';
        } else {
            statusMsg.style.display = 'none';
        }
    }

    changeGameMode() {
        // Clean up Firebase listener if active
        if (this.gameUnsubscribe) {
            this.gameUnsubscribe();
            this.gameUnsubscribe = null;
        }

        // Close any modals
        document.getElementById('gameRoomModal').style.display = 'none';
        document.getElementById('waitingRoomModal').style.display = 'none';

        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('gameResult').style.display = 'none';
        document.getElementById('coinFlipContainer').style.display = 'none';
        document.getElementById('gameModeSelection').style.display = 'block';
        this.gameMode = null;
        this.gameRoomId = null;
        this.myPlayerColor = null;
        
        // Clear URL parameters when changing mode
        if (window.history.replaceState) {
            const url = new URL(window.location);
            url.searchParams.delete('state');
            window.history.replaceState({}, '', url);
        }
    }

    // Firebase Online Multiplayer Methods
    createGameRoom() {
        if (!this.firebaseEnabled) {
            alert('Firebase not available. Please ensure you are accessing via HTTPS.');
            return;
        }

        // Get player name from input
        const nameInput = document.getElementById('playerNameInput');
        this.myPlayerName = nameInput.value.trim() || 'Player 1';
        if (this.myPlayerName.length > 15) {
            this.myPlayerName = this.myPlayerName.substring(0, 15);
        }

        // Generate unique room ID (just numbers, 6 digits)
        this.myPlayerColor = 'green'; // Creator is always green
        this.gameMode = 'online';
        this.opponentName = 'Waiting...'; // Will be set when player 2 joins

        // Reset board for new game
        this.resetBoard();
        // Randomly determine starting player
        this.currentPlayer = Math.random() < 0.5 ? 'green' : 'red';

        // Create game room with unique 6-digit number
        this.createUniqueRoom().then(() => {
            // Close modals, show waiting room
            document.getElementById('gameRoomModal').style.display = 'none';
            document.getElementById('waitingRoomModal').style.display = 'block';
            document.getElementById('gameRoomIdDisplay').value = this.gameRoomId;

            // Listen for player 2 to join
            this.listenForPlayerJoin();

            // Update status
            document.getElementById('roomStatus').textContent = 'Room created! Share the ID.';
        }).catch(error => {
            console.error('Error creating game room:', error);
            alert('Failed to create game room. Please try again.');
        });
    }

    createUniqueRoom() {
        // Try to create a room with a unique 6-digit number
        const tryCreateRoom = (attempts = 0) => {
            if (attempts > 10) {
                // Fallback to timestamp-based ID if too many attempts
                this.gameRoomId = Date.now().toString();
            } else {
                // Generate 6-digit number (100000 to 999999)
                const roomNumber = Math.floor(100000 + Math.random() * 900000);
                this.gameRoomId = roomNumber.toString();
            }

            // Check if room already exists
            return db.collection('gameRooms').doc(this.gameRoomId).get().then(doc => {
                if (doc.exists && doc.data().status !== 'finished') {
                    // Room exists and is active, try again
                    if (attempts < 10) {
                        return tryCreateRoom(attempts + 1);
                    } else {
                        // Use timestamp as fallback
                        this.gameRoomId = Date.now().toString();
                        return this.createRoomInFirebase();
                    }
                } else {
                    // Room doesn't exist or is finished, use this ID
                    return this.createRoomInFirebase();
                }
            });
        };

        return tryCreateRoom();
    }

    createRoomInFirebase() {
        // Create game room in Firebase
        const gameState = this.getGameState();
        return db.collection('gameRooms').doc(this.gameRoomId).set({
            player1: 'green',
            player1Name: this.myPlayerName,
            player2: null, // Waiting for player 2
            player2Name: null,
            gameState: gameState,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'waiting' // waiting, active, finished
        }).then(() => {
            // Close modals, show waiting room
            document.getElementById('gameRoomModal').style.display = 'none';
            document.getElementById('waitingRoomModal').style.display = 'block';
            document.getElementById('gameRoomIdDisplay').value = this.gameRoomId;
        });
    }

    joinGameRoom() {
        const roomId = document.getElementById('roomIdInput').value.trim();
        if (!roomId) {
            alert('Please enter a Game ID');
            return;
        }

        // Get player name from input
        const nameInput = document.getElementById('playerNameInput');
        this.myPlayerName = nameInput.value.trim() || 'Player 2';
        if (this.myPlayerName.length > 15) {
            this.myPlayerName = this.myPlayerName.substring(0, 15);
        }

        if (!this.firebaseEnabled) {
            alert('Firebase not available. Please ensure you are accessing via HTTPS.');
            return;
        }

        this.gameRoomId = roomId;
        this.gameMode = 'online';

        // Check if room exists and has space
        db.collection('gameRooms').doc(roomId).get().then(doc => {
            if (!doc.exists) {
                alert('Game room not found. Please check the Game ID.');
                return;
            }

            const roomData = doc.data();
            if (roomData.player2) {
                alert('This room is already full.');
                return;
            }

            if (roomData.status !== 'waiting') {
                alert('This game has already started or finished.');
                return;
            }

            // Join as player 2 (red)
            this.myPlayerColor = 'red';
            this.opponentName = roomData.player1Name || 'Player 1'; // Get player 1's name
            
            // Update scoreboard with names
            this.updateScoreDisplay();
            
            db.collection('gameRooms').doc(roomId).update({
                player2: 'red',
                player2Name: this.myPlayerName,
                status: 'active'
                // Don't update gameState here - let the listener pick it up from player 1
            }).then(() => {
                // Load game state and start listening
                this.loadGameStateFromFirebase(roomData.gameState);
                this.setupFirebaseGameListener();
                
                // Close modals and start game
                document.getElementById('gameRoomModal').style.display = 'none';
                document.getElementById('waitingRoomModal').style.display = 'none';
        
        document.getElementById('gameModeSelection').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
                document.getElementById('shareGameBtn').style.display = 'none'; // No need to share in Firebase mode
            }).catch(error => {
                console.error('Error joining game room:', error);
                alert('Failed to join game room. Please try again.');
            });
        }).catch(error => {
            console.error('Error checking game room:', error);
            alert('Failed to connect to game room. Please check your connection.');
        });
    }

    listenForPlayerJoin() {
        db.collection('gameRooms').doc(this.gameRoomId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.player2 && data.status === 'active') {
                        // Player 2 joined! Get their name and start the game
                        this.opponentName = data.player2Name || 'Player 2';
                        
                        // Update scoreboard with names
                        this.updateScoreDisplay();
                        
                        // Player 2 joined! Start the game
                        document.getElementById('waitingRoomModal').style.display = 'none';
                        document.getElementById('gameModeSelection').style.display = 'none';
                        document.getElementById('gameContainer').style.display = 'block';
                        document.getElementById('shareGameBtn').style.display = 'none';
                        
                        // Ensure game is active
                        this.gameActive = true;
                        
                        // Load initial game state
                        if (data.gameState) {
                            this.loadGameStateFromFirebase(data.gameState);
                        } else {
                            // Initialize game state if it doesn't exist
                            this.resetBoard();
                            // Randomly determine starting player
                            this.currentPlayer = Math.random() < 0.5 ? 'green' : 'red';
                            this.syncGameStateToFirebase();
                        }
                        
                        // Start listening for game updates
                        this.setupFirebaseGameListener();
                        
                        // Update display
        this.updateCurrentPlayerDisplay();
        this.updatePlayerDeck();
                    }
                }
            }, (error) => {
                console.error('Error listening for player join:', error);
            });
    }

    setupFirebaseGameListener() {
        // Listen for real-time game state updates
        if (this.gameUnsubscribe) {
            this.gameUnsubscribe(); // Unsubscribe from previous listener
        }

        this.gameUnsubscribe = db.collection('gameRooms').doc(this.gameRoomId)
            .onSnapshot((doc) => {
                if (!doc.exists) return;

                const data = doc.data();
                const gameState = data.gameState;

                // Always sync game state from Firebase (it's the source of truth)
                if (gameState && this.gameMode === 'online') {
                    // Check if state actually changed before processing to prevent infinite loops
                    const currentState = this.getGameState();
                    if (this.hasGameStateChanged(gameState)) {
                        this.loadGameStateFromFirebase(gameState);
                    }
                    
                    // Also sync player names from room data
                    if (data.player1Name && this.myPlayerColor === 'green') {
                        this.opponentName = data.player2Name || 'Player 2';
                        this.updateScoreDisplay(); // Update scoreboard with names
                    } else if (data.player2Name && this.myPlayerColor === 'red') {
                        this.opponentName = data.player1Name || 'Player 1';
                        this.updateScoreDisplay(); // Update scoreboard with names
                    }
                }
            }, (error) => {
                console.error('Error listening for game updates:', error);
            });
    }

    hasGameStateChanged(newState) {
        // Check if board, current player, game result, emote, or ready status changed
        return JSON.stringify(this.board) !== JSON.stringify(newState.board) ||
               this.currentPlayer !== newState.currentPlayer ||
               JSON.stringify(this.gameResult) !== JSON.stringify(newState.gameResult) ||
               this.gameActive !== newState.gameActive ||
               this.myEmote !== newState.myEmote || // Check for emote changes
               this.receivedEmote !== newState.receivedEmote || // Check for received emote changes
               this.player1Ready !== newState.player1Ready || // Check for ready status changes
               this.player2Ready !== newState.player2Ready; // Check for ready status changes
    }

    getGameState() {
        return {
            board: this.board,
            currentPlayer: this.currentPlayer,
            gameActive: this.gameActive,
            scores: this.scores,
            replacedTiles: Array.from(this.replacedTiles),
            playerDecks: this.playerDecks,
            storedCellColors: this.storedCellColors,
            gameResult: this.gameResult || null, // Store the result (win/draw) for both players to see
            player1Emote: (this.myPlayerColor === 'green' ? this.myEmote : this.receivedEmote) || null, // Player 1 (green) emote
            player2Emote: (this.myPlayerColor === 'red' ? this.myEmote : this.receivedEmote) || null, // Player 2 (red) emote
            player1Ready: this.player1Ready || false, // Player 1 (green) ready status
            player2Ready: this.player2Ready || false // Player 2 (red) ready status
        };
    }

    loadGameStateFromFirebase(gameState) {
        if (!gameState) return;
        
        // Prevent recursive calls by checking if we're already loading
        if (this.isLoadingFromFirebase) {
            return;
        }
        this.isLoadingFromFirebase = true;

        try {
            // Store previous state to detect changes
            const previousBoard = JSON.stringify(this.board);
            const previousCurrentPlayer = this.currentPlayer;
            const wasGameActive = this.gameActive;
            
            // Always restore full game state from Firebase (Firebase is the source of truth)
            // This ensures turns switch correctly for both players
            this.board = gameState.board || ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
            const newCurrentPlayer = gameState.currentPlayer || 'green';
            this.currentPlayer = newCurrentPlayer; // ALWAYS sync currentPlayer from Firebase
            this.gameActive = gameState.gameActive !== false;
            this.scores = gameState.scores || { green: 0, red: 0, draws: 0 };
            this.replacedTiles = new Set(gameState.replacedTiles || []);
            this.storedCellColors = gameState.storedCellColors || ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
            this.playerDecks = gameState.playerDecks || {
                green: this.createDeck('green'),
                red: this.createDeck('red')
            };
            this.gameResult = gameState.gameResult || null; // Sync game result
            this.player1Ready = gameState.player1Ready || false; // Sync ready status
            this.player2Ready = gameState.player2Ready || false; // Sync ready status
            
            // If game is active (new game started), always hide result screen and show game
            // This ensures both players see the game board when a new game starts
            if (this.gameActive && this.gameMode === 'online' && !this.gameResult) {
                const gameResultEl = document.getElementById('gameResult');
                const gameContainerEl = document.getElementById('gameContainer');
                
                // Always hide result screen when game is active and there's no result
                // This prevents the result screen from blocking gameplay after both players join a new game
                if (gameResultEl) {
                    gameResultEl.style.display = 'none';
                }
                if (gameContainerEl) {
                    gameContainerEl.style.display = 'block';
                }
            } else if (!wasGameActive && this.gameActive && this.gameMode === 'online') {
                // Fallback: if game just became active, also ensure result screen is hidden
                const gameResultEl = document.getElementById('gameResult');
                const gameContainerEl = document.getElementById('gameContainer');
                
                if (gameResultEl) {
                    gameResultEl.style.display = 'none';
                }
                if (gameContainerEl) {
                    gameContainerEl.style.display = 'block';
                }
            }
            
            // Check if opponent just made a move (board changed, turn changed to us, and it was opponent's turn before)
            const boardChanged = previousBoard !== JSON.stringify(this.board);
            const opponentColor = this.myPlayerColor === 'green' ? 'red' : 'green';
            const turnChangedToUs = previousCurrentPlayer !== newCurrentPlayer && newCurrentPlayer === this.myPlayerColor;
            const wasOpponentTurn = previousCurrentPlayer === opponentColor;
            
            // Vibrate if opponent made a move and it's now our turn
            if (this.gameMode === 'online' && this.gameActive && boardChanged && turnChangedToUs && wasOpponentTurn) {
                this.vibrate();
            }
            
            // Update ready status display if game is over
            if (!this.gameActive && this.gameMode === 'online') {
                this.updateReadyStatusDisplay();
            }
            
            // Sync emotes - get emotes based on player colors
            // Player 1 (green) emote and Player 2 (red) emote are stored separately
            const player1Emote = gameState.player1Emote || null;
            const player2Emote = gameState.player2Emote || null;
            
            // Set our emote and opponent's emote based on which player we are
            if (this.myPlayerColor === 'green') {
                // We are Player 1 (green)
                this.myEmote = player1Emote;
                this.receivedEmote = player2Emote;
            } else {
                // We are Player 2 (red)
                this.myEmote = player2Emote;
                this.receivedEmote = player1Emote;
            }
            
            // Update emote display if game has ended (show both emotes side by side)
            if (!this.gameActive && this.gameMode === 'online') {
                this.updateEmoteDisplay();
            }

            // Restore visual state
            this.restoreVisualState();
            this.updateCurrentPlayerDisplay();
            this.updatePlayerDeck();
            this.updateScoreDisplay();

            // Clear loading flag
            this.isLoadingFromFirebase = false;
            
            // Check for game end - show result if game ended
            // Only show result if game is NOT active (safeguard against showing result during active gameplay)
            if (!this.gameActive && this.gameResult && this.gameMode === 'online') {
                // Game ended - show the result message for both players
                let message = this.gameResult.message;
                // For online mode, adjust the message if it's about us
                if (this.gameResult.type === 'win') {
                    if (this.gameResult.winner === this.myPlayerColor) {
                        message = 'You Win! 🎉';
                    } else {
                        // Opponent won - opponentName is always the other player's name
                        const winnerName = this.opponentName || 'Opponent';
                        message = `${winnerName} Wins! 🎉`;
                    }
                }
                this.showResult(message);
            }
        } catch (error) {
            console.error('Error loading game state from Firebase:', error);
            this.isLoadingFromFirebase = false; // Always clear flag, even on error
        }
    }

    updateEmoteDisplay() {
        // Display both players' emotes side by side
        const myEmoteDisplay = document.getElementById('myEmoteDisplay');
        const receivedEmoteDisplay = document.getElementById('receivedEmoteDisplay');
        const myEmoteLabel = document.getElementById('myEmoteLabel');
        const opponentEmoteLabel = document.getElementById('opponentEmoteLabel');
        const emoteDisplay = document.getElementById('emoteDisplay');
        
        if (!emoteDisplay) return;
        
        // Update labels with player names for online mode
        if (this.gameMode === 'online') {
            if (myEmoteLabel) {
                myEmoteLabel.textContent = this.myPlayerName || 'You';
            }
            if (opponentEmoteLabel) {
                opponentEmoteLabel.textContent = this.opponentName || 'Opponent';
            }
        }
        
        // Show your emote
        if (myEmoteDisplay) {
            if (this.myEmote) {
                // Add animation
                myEmoteDisplay.style.animation = 'none';
                setTimeout(() => {
                    myEmoteDisplay.style.animation = 'popIn 0.3s ease';
                }, 10);
                myEmoteDisplay.textContent = this.myEmote;
            } else {
                myEmoteDisplay.textContent = '—';
                myEmoteDisplay.style.animation = 'none';
            }
        }
        
        // Show opponent's emote
        if (receivedEmoteDisplay) {
            if (this.receivedEmote) {
                // Add animation
                receivedEmoteDisplay.style.animation = 'none';
                setTimeout(() => {
                    receivedEmoteDisplay.style.animation = 'popIn 0.3s ease';
                }, 10);
                receivedEmoteDisplay.textContent = this.receivedEmote;
            } else {
                receivedEmoteDisplay.textContent = '—';
                receivedEmoteDisplay.style.animation = 'none';
            }
        }
    }
    
    displayReceivedEmote(emote) {
        // Legacy function - now we use updateEmoteDisplay instead
        // This is kept for backwards compatibility but updateEmoteDisplay handles everything
        this.updateEmoteDisplay();
    }

    vibrate() {
        // Vibrate on mobile devices when opponent makes a move
        if ('vibrate' in navigator) {
            // Short vibration pattern: vibrate for 200ms, pause 100ms, vibrate 200ms
            navigator.vibrate([200, 100, 200]);
        }
    }

    syncGameStateToFirebase() {
        if (!this.firebaseEnabled || !this.gameRoomId) return;

        const gameState = this.getGameState();
        db.collection('gameRooms').doc(this.gameRoomId).update({
            gameState: gameState,
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(error => {
            console.error('Error syncing game state:', error);
        });
    }

    loadGameFromURL(encodedState) {
        try {
            const gameState = JSON.parse(atob(encodedState));
            
            // Restore game state
            this.board = gameState.board || ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
            this.currentPlayer = gameState.currentPlayer || 'green';
            this.gameActive = gameState.gameActive || false;
            this.scores = gameState.scores || { green: 0, red: 0, draws: 0 };
            this.replacedTiles = new Set(gameState.replacedTiles || []);
            this.storedCellColors = gameState.storedCellColors || ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
            
            // Restore player decks
            this.playerDecks = gameState.playerDecks || {
                green: this.createDeck('green'),
                red: this.createDeck('red')
            };
            
            // Show game interface
            document.getElementById('gameModeSelection').style.display = 'none';
            document.getElementById('coinFlipContainer').style.display = 'none';
            document.getElementById('gameContainer').style.display = 'block';
            document.getElementById('gameResult').style.display = 'none';
            
            // Show share button for online mode
            document.getElementById('shareGameBtn').style.display = 'inline-block';
            
            // Restore visual state
            this.restoreVisualState();
            this.updateCurrentPlayerDisplay();
            this.updatePlayerDeck();
            this.updateScoreDisplay();
            
        } catch (error) {
            console.error('Error loading game from URL:', error);
            alert('Invalid game URL. Starting new game instead.');
            this.startNewOnlineGame();
        }
    }

    restoreVisualState() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell, index) => {
            const cellValue = this.board[index];
            if (cellValue && typeof cellValue === 'number') {
                // Get color from the stored game state instead of DOM
                const cellColor = this.getStoredCellColor(index);
                cell.innerHTML = `<span class="number">${cellValue}</span>`;
                cell.className = `cell ${cellColor}`;
                
                if (this.replacedTiles.has(index)) {
                    cell.classList.add('locked');
                }
            } else {
                cell.innerHTML = '';
                cell.className = 'cell';
            }
        });
    }

    getStoredCellColor(index) {
        // This method will be used to get color from stored state
        // We need to store cell colors in the game state
        return this.storedCellColors ? this.storedCellColors[index] : '';
    }

    updateURL() {
        if (this.gameMode === 'online') {
            const gameState = {
                board: this.board,
                currentPlayer: this.currentPlayer,
                gameActive: this.gameActive,
                scores: this.scores,
                replacedTiles: Array.from(this.replacedTiles),
                playerDecks: this.playerDecks,
                storedCellColors: this.storedCellColors
            };
            
            const encodedState = btoa(JSON.stringify(gameState));
            const url = new URL(window.location);
            url.searchParams.set('state', encodedState);
            
            if (window.history.replaceState) {
                window.history.replaceState({}, '', url);
            }
        }
    }

    encodeGameState() {
        const gameState = {
            board: this.board,
            currentPlayer: this.currentPlayer,
            gameActive: this.gameActive,
            scores: this.scores,
            replacedTiles: Array.from(this.replacedTiles),
            playerDecks: this.playerDecks,
            storedCellColors: this.storedCellColors
        };
        
        return btoa(JSON.stringify(gameState));
    }
}

// Global functions for HTML onclick handlers
let game;

function startGame(mode) {
    if (!game) {
        game = new TicTacToeCardGame();
    }
    game.startGame(mode);
}

function resetGame() {
    if (game) {
        game.resetGame();
    }
}

function changeGameMode() {
    if (game) {
        game.changeGameMode();
    }
}

function proceedToGame() {
    if (game) {
        game.proceedToGame();
    }
}

function showGameRoomModal() {
    if (!game.firebaseEnabled) {
        alert('Firebase is not available. Please access this game via HTTPS to use online multiplayer.');
        return;
    }
    document.getElementById('gameRoomModal').style.display = 'block';
}

function closeGameRoomModal() {
    document.getElementById('gameRoomModal').style.display = 'none';
    // Clear the input field
    const roomIdInput = document.getElementById('roomIdInput');
    if (roomIdInput) {
        roomIdInput.value = '';
    }
    // Clear status message
    const roomStatus = document.getElementById('roomStatus');
    if (roomStatus) {
        roomStatus.textContent = '';
    }
}

function handleModalBackdropClick(event) {
    // Close modal if clicking on the backdrop (not the modal content)
    if (event.target.id === 'gameRoomModal') {
        closeGameRoomModal();
    } else if (event.target.id === 'waitingRoomModal') {
        cancelWaitingRoom();
    }
}

function cancelWaitingRoom() {
    // Clean up Firebase listener if active
    if (game && game.gameUnsubscribe) {
        game.gameUnsubscribe();
        game.gameUnsubscribe = null;
    }
    
    // Delete the game room if it exists
    if (game && game.gameRoomId && typeof db !== 'undefined' && db !== null) {
        db.collection('gameRooms').doc(game.gameRoomId).delete().catch(err => {
            console.log('Error deleting game room:', err);
        });
    }
    
    // Reset game state
    if (game) {
        game.gameRoomId = null;
        game.myPlayerColor = null;
        game.gameMode = null;
    }
    
    // Close modal and return to main menu
    document.getElementById('waitingRoomModal').style.display = 'none';
    document.getElementById('gameRoomModal').style.display = 'none';
    document.getElementById('gameModeSelection').style.display = 'block';
    document.getElementById('gameContainer').style.display = 'none';
}

function createGameRoom() {
    if (game) {
        game.createGameRoom();
    }
}

function joinGameRoom() {
    if (game) {
        game.joinGameRoom();
    }
}

function sendEmote(emote) {
    if (!game || game.gameMode !== 'online') return;
    
    // Store the emote we're sending
    game.myEmote = emote;
    
    // Update display immediately to show our emote
    if (!game.gameActive) {
        game.updateEmoteDisplay();
    }
    
    // Sync to Firebase so opponent sees it
    if (game.firebaseEnabled) {
        game.syncGameStateToFirebase();
    }
    
    // Visual feedback on button
    const btn = event.target;
    const originalTransform = btn.style.transform;
    btn.style.transform = 'scale(1.3)';
            setTimeout(() => {
        btn.style.transform = originalTransform;
    }, 200);
}

function copyGameRoomId() {
    const roomIdInput = document.getElementById('gameRoomIdDisplay');
    const copyBtn = document.getElementById('copyGameRoomBtn');
    
    if (!roomIdInput) return;
    
    roomIdInput.select();
    roomIdInput.setSelectionRange(0, 99999);
    try {
        document.execCommand('copy');
        const originalText = copyBtn ? copyBtn.textContent : 'Copy';
        if (copyBtn) {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }
    } catch (err) {
        navigator.clipboard.writeText(roomIdInput.value).then(() => {
            const originalText = copyBtn ? copyBtn.textContent : 'Copy';
            if (copyBtn) {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }
        });
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker for PWA
    // Service worker registration is now handled by UpdateManager
    
    game = new TicTacToeCardGame();
    
    // Ensure modals are closed on load
    document.getElementById('gameRoomModal').style.display = 'none';
    document.getElementById('waitingRoomModal').style.display = 'none';
    
    // Add touch-friendly event listeners for mobile buttons
    const createGameBtn = document.getElementById('createGameBtn');
    const joinGameBtn = document.getElementById('joinGameBtn');
    const copyGameRoomBtn = document.getElementById('copyGameRoomBtn');
    
    if (createGameBtn) {
        createGameBtn.addEventListener('click', createGameRoom);
        createGameBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            createGameRoom();
        });
    }
    
    if (joinGameBtn) {
        joinGameBtn.addEventListener('click', joinGameRoom);
        joinGameBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            joinGameRoom();
        });
    }
    
    if (copyGameRoomBtn) {
        copyGameRoomBtn.addEventListener('click', copyGameRoomId);
        copyGameRoomBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            copyGameRoomId();
        });
    }
    
    // Add touch support for emote buttons
    const emoteButtons = document.querySelectorAll('.emote-btn');
    emoteButtons.forEach(btn => {
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            const emote = btn.textContent.trim();
            sendEmote(emote);
        });
    });
    
    // Check if there's a game state in URL on page load
    const urlParams = new URLSearchParams(window.location.search);
    const gameState = urlParams.get('state');
    
    if (gameState) {
        // Auto-start online mode if URL contains game state
        game.startGame('online');
    }
});

// Update Manager Class
class UpdateManager {
    constructor() {
        this.registration = null;
        this.updateAvailable = false;
        this.checkingForUpdate = false;
        this.setupUI();
    }
    
    setupUI() {
        // Setup update banner buttons (use event delegation since elements are created dynamically)
        document.body.addEventListener('click', (e) => {
            if (e.target.id === 'updateNowBtn') {
                this.applyUpdate();
            } else if (e.target.id === 'updateLaterBtn') {
                this.hideUpdateBanner();
            }
        });
        
        // Setup settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        // Setup check for updates button in settings
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => this.checkForUpdate());
        }
        
        // Setup close settings modal
        const closeSettingsModal = document.getElementById('closeSettingsModal');
        const settingsModal = document.getElementById('settingsModal');
        if (closeSettingsModal && settingsModal) {
            closeSettingsModal.addEventListener('click', () => this.closeSettings());
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    this.closeSettings();
                }
            });
        }
    }
    
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
            console.log('Service Workers not supported or file protocol');
            return;
        }
        
        try {
            this.registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
            console.log('Service Worker registered:', this.registration);
            
            // Check for updates immediately
            await this.checkForUpdate();
            
            // Listen for service worker updates
            this.registration.addEventListener('updatefound', () => {
                console.log('Service Worker update found');
                this.handleUpdateFound();
            });
            
            // Check for updates periodically (every 5 minutes)
            setInterval(() => this.checkForUpdate(), 5 * 60 * 1000);
            
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
    
    async checkForUpdate() {
        if (this.checkingForUpdate || !this.registration) return;
        
        this.checkingForUpdate = true;
        const checkBtn = document.getElementById('checkUpdateBtn');
        const updateBtnText = document.getElementById('updateBtnText');
        const updateStatusText = document.getElementById('updateStatusText');
        
        if (checkBtn) {
            checkBtn.disabled = true;
        }
        if (updateBtnText) {
            updateBtnText.textContent = '⏳ Checking...';
        }
        if (updateStatusText) {
            updateStatusText.textContent = '';
        }
        
        try {
            // Force update check
            await this.registration.update();
            
            // Check if there's a waiting service worker
            if (this.registration.waiting) {
                this.updateAvailable = true;
                this.showUpdateBanner();
                if (updateStatusText) {
                    updateStatusText.textContent = 'Update available! See banner at top.';
                    updateStatusText.style.color = 'var(--primary-color)';
                }
            } else {
                // Check if there's an installing service worker
                if (this.registration.installing) {
                    this.handleUpdateFound();
                } else {
                    console.log('No updates available');
                    if (updateBtnText) {
                        updateBtnText.textContent = '✅ Up to date';
                    }
                    if (updateStatusText) {
                        updateStatusText.textContent = 'You have the latest version.';
                        updateStatusText.style.color = 'var(--text-secondary)';
                    }
                    setTimeout(() => {
                        if (updateBtnText) {
                            updateBtnText.textContent = '🔄 Check for Updates';
                        }
                        if (checkBtn) {
                            checkBtn.disabled = false;
                        }
                        if (updateStatusText) {
                            updateStatusText.textContent = '';
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            if (updateBtnText) {
                updateBtnText.textContent = '❌ Error';
            }
            if (updateStatusText) {
                updateStatusText.textContent = 'Failed to check for updates.';
                updateStatusText.style.color = 'var(--primary-color)';
            }
            setTimeout(() => {
                if (updateBtnText) {
                    updateBtnText.textContent = '🔄 Check for Updates';
                }
                if (checkBtn) {
                    checkBtn.disabled = false;
                }
                if (updateStatusText) {
                    updateStatusText.textContent = '';
                }
            }, 2000);
        } finally {
            this.checkingForUpdate = false;
        }
    }
    
    handleUpdateFound() {
        const installingWorker = this.registration.installing;
        if (!installingWorker) return;
        
        installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                    // New service worker is waiting
                    this.updateAvailable = true;
                    this.showUpdateBanner();
                } else {
                    // First time install
                    console.log('Service Worker installed for the first time');
                }
            }
        });
    }
    
    showUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.remove('hidden');
        }
        const updateBtnText = document.getElementById('updateBtnText');
        if (updateBtnText) {
            updateBtnText.textContent = '🔄 Update Available';
        }
        const checkBtn = document.getElementById('checkUpdateBtn');
        if (checkBtn) {
            checkBtn.disabled = false;
        }
    }
    
    hideUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }
    
    async applyUpdate() {
        try {
            // Clear all caches first to ensure fresh files are loaded
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(cacheName => {
                    console.log('Deleting cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
            
            // Unregister all service workers
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                registrations.map(registration => {
                    console.log('Unregistering service worker');
                    return registration.unregister();
                })
            );
            
            // If there's a waiting worker, tell it to skip waiting
            if (this.registration && this.registration.waiting) {
                this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Force reload with cache bypass (use timestamp to bust cache)
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        } catch (error) {
            console.error('Error applying update:', error);
            // Fallback: reload with cache bypass
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }
    }
    
    async loadVersion() {
        const versionText = document.getElementById('versionText');
        if (!versionText) return;
        
        try {
            // Get version from cache name (most reliable method)
            const cacheNames = await caches.keys();
            const currentCache = cacheNames.find(name => name.startsWith('tictactoe-advanced-'));
            if (currentCache) {
                const version = currentCache.replace('tictactoe-advanced-', '');
                versionText.textContent = `App Version: ${version}`;
            } else {
                // Try to get from service worker if available
                if (this.registration && this.registration.active) {
                    // Fetch the service worker script and extract version
                    try {
                        const swResponse = await fetch('./service-worker.js?t=' + Date.now());
                        const swText = await swResponse.text();
                        const versionMatch = swText.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
                        if (versionMatch) {
                            versionText.textContent = `App Version: ${versionMatch[1]}`;
                        } else {
                            versionText.textContent = 'App Version: Unknown';
                        }
                    } catch (e) {
                        versionText.textContent = 'App Version: Not installed';
                    }
                } else {
                    versionText.textContent = 'App Version: Not installed';
                }
            }
        } catch (error) {
            console.error('Error loading version:', error);
            versionText.textContent = 'App Version: Error';
        }
    }
    
    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = 'block';
            // Load version when opening settings
            this.loadVersion();
        }
    }
    
    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

// Initialize Update Manager
let updateManager = null;
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        updateManager = new UpdateManager();
        window.updateManager = updateManager; // Make it globally accessible
        updateManager.registerServiceWorker();
    });
}