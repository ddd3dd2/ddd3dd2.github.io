/**
 * main.js
 * Core Tetris Game Logic
 */

// Constants
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // Matches canvas width 300 / 10

const COLORS = [
    null,
    '#ff0d72', // T
    '#0dc2ff', // O
    '#0dff72', // S
    '#f538ff', // Z
    '#ff8e0d', // L
    '#ffe138', // J
    '#3877ff', // I
];

const SHAPES = [
    [],
    [[0, 1, 0], [1, 1, 1], [0, 0, 0]], // T
    [[2, 2], [2, 2]],                   // O
    [[0, 3, 3], [3, 3, 0], [0, 0, 0]], // S
    [[4, 4, 0], [0, 4, 4], [0, 0, 0]], // Z
    [[0, 0, 5], [5, 5, 5], [0, 0, 0]], // L
    [[6, 0, 0], [6, 6, 6], [0, 0, 0]], // J
    [[0, 0, 0, 0], [7, 7, 7, 7], [0, 0, 0, 0], [0, 0, 0, 0]] // I
];

// Elements
const canvas = document.getElementById('tetris-board');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const linesElement = document.getElementById('lines');
const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');

// Game State
let grid = createGrid(COLS, ROWS);
let player = {
    pos: { x: 0, y: 0 },
    matrix: null,
    score: 0,
    level: 1,
    lines: 0,
};
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let animationId = null;
let isGameOver = false;
let isPaused = false;

// Initialization
ctx.scale(BLOCK_SIZE, BLOCK_SIZE);

function createGrid(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 &&
                (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function drawMatrix(matrix, offset) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                // Glow effect simulation via shadow
                // Note: Standard canvas fillRect doesn't support complex CSS shadows easily per rect.
                // We'll simulate a 3D-ish block.

                // Base
                ctx.fillStyle = COLORS[value];
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);

                // Highlight
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fillRect(x + offset.x, y + offset.y, 1, 0.2);

                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(x + offset.x, y + offset.y + 0.8, 1, 0.2);

                // Outline to separate blocks
                ctx.lineWidth = 0.05;
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function draw() {
    // Clear
    ctx.fillStyle = '#0f172a'; // Match bg
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Use pixel coords for clear because scale
    // Actually we scaled context.
    ctx.fillRect(0, 0, COLS, ROWS);

    drawMatrix(grid, { x: 0, y: 0 });
    drawMatrix(player.matrix, player.pos);
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                arena[y + player.pos.y][x + player.pos.x] = value;
            }
        });
    });
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        matrix.reverse();
    }
}

function playerDrop() {
    player.pos.y++;
    if (collide(grid, player)) {
        player.pos.y--;
        merge(grid, player);
        playerReset();
        arenaSweep();
        updateScore();
    }
    dropCounter = 0;
}

function playerMove(dir) {
    player.pos.x += dir;
    if (collide(grid, player)) {
        player.pos.x -= dir;
    }
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(grid, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
}

function playerReset() {
    const pieces = 'ILJOTSZ';
    const typeId = pieces.length * Math.random() | 0;
    const type = pieces[typeId];

    // Simple shape creation - ideally map
    // We already have SHAPES array. 
    // We need to map 'ILJOTSZ' chars to indices 1-7.
    // Index map: T:1, O:2, S:3, Z:4, L:5, J:6, I:7
    // Let's just pick random index 1-7
    const idx = (Math.random() * 7 | 0) + 1;
    player.matrix = createPiece(idx);

    player.pos.y = 0;
    player.pos.x = (grid[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);

    if (collide(grid, player)) {
        gameOver();
    }
}

function createPiece(typeIdx) {
    // Deep copy the shape to avoid modifying the reference
    return SHAPES[typeIdx].map(row => [...row]);
}

function arenaSweep() {
    let rowCount = 0;
    outer: for (let y = grid.length - 1; y > 0; --y) {
        for (let x = 0; x < grid[y].length; ++x) {
            if (grid[y][x] === 0) {
                continue outer;
            }
        }

        const row = grid.splice(y, 1)[0].fill(0);
        grid.unshift(row);
        ++y;

        rowCount++;
    }

    if (rowCount > 0) {
        player.score += rowCount * 10 * rowCount;
        player.lines += rowCount;
        player.level = Math.floor(player.lines / 10) + 1;
        dropInterval = Math.max(100, 1000 - (player.level - 1) * 100);
    }
}

function updateScore() {
    scoreElement.innerText = player.score;
    levelElement.innerText = player.level;
    linesElement.innerText = player.lines;
}

function gameOver() {
    isGameOver = true;
    cancelAnimationFrame(animationId);
    overlayTitle.innerText = "GAME OVER";
    startBtn.innerText = "Try Again";
    overlay.classList.add('active');
}

function resetGame() {
    grid = createGrid(COLS, ROWS);
    player.score = 0;
    player.lines = 0;
    player.level = 1;
    dropInterval = 1000;
    updateScore();
    isGameOver = false;
    overlay.classList.remove('active');
    playerReset();
    lastTime = 0; // Reset time
    update();
}

let lastTimestamp = 0;
function update(time = 0) {
    if (isPaused || isGameOver) return;

    const deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    draw();
    animationId = requestAnimationFrame(update);
}

// Controls
document.addEventListener('keydown', event => {
    if (isGameOver) return;

    if (event.keyCode === 37) { // Left
        playerMove(-1);
    } else if (event.keyCode === 39) { // Right
        playerMove(1);
    } else if (event.keyCode === 40) { // Down
        playerDrop();
    } else if (event.keyCode === 38) { // Up (Rotate)
        playerRotate(1);
    } else if (event.keyCode === 32) { // Space (Hard Drop - simplified)
        // For now just fast drop
        playerDrop();
    }
});

startBtn.addEventListener('click', () => {
    resetGame();
});

// Initial View
draw();
