const STORAGE_KEY = 'jiunbs_2026_esports_state';

// DOM Elements
const form = {
    gameSelect: document.getElementById('game-select'),
    participantCount: document.getElementById('participant-count'),
    participantList: document.getElementById('participant-list'),
    generateBtn: document.getElementById('generate-btn'),
    clearBtn: document.getElementById('clear-data-btn'),
    countIndicator: document.getElementById('count-indicator'),
    gameInfoBadge: document.querySelector('.info-panel .badge'),
    gameInfoText: document.querySelector('.info-panel p')
};

const bracketContainer = document.getElementById('bracket-container');
const bracketWrapper = document.getElementById('bracket-wrapper');
const emptyState = document.getElementById('empty-state');

// Application State
let appState = {
    game: 'lol',
    participants: [],
    bracket: [],
    thirdPlaceMatch: null
};

// Modality Info Mapping
const gameInfo = {
    lol: { name: 'League of Legends', type: 'Coletivo', label: 'Equipes' },
    valorant: { name: 'Valorant', type: 'Coletivo', label: 'Equipes' },
    cs2: { name: 'Counter-Strike 2', type: 'Coletivo', label: 'Equipes' },
    brawlstars: { name: 'Brawl Stars', type: 'Coletivo', label: 'Equipes' },
    freefire: { name: 'Free Fire', type: 'Coletivo', label: 'Equipes' },
    futebol: { name: 'Futebol Eletrônico', type: 'Individual', label: 'Jogadores' }
};

// Initialize
function init() {
    setupEventListeners();
    loadState();
    updateUI();
}

function setupEventListeners() {
    form.gameSelect.addEventListener('change', (e) => {
        updateGameInfo(e.target.value);
    });

    form.participantList.addEventListener('input', updateCountIndicator);

    form.generateBtn.addEventListener('click', () => {
        generateTournament();
    });

    form.clearBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todos os dados do torneio atual?')) {
            clearData();
        }
    });
    
    // Delegate events for bracket interaction
    bracketWrapper.addEventListener('click', handleBracketClick);
    bracketWrapper.addEventListener('change', handleBracketChange);
}

function updateGameInfo(gameKey) {
    const info = gameInfo[gameKey];
    if (!info) return;
    
    form.gameInfoBadge.textContent = info.name;
    form.gameInfoBadge.className = `badge ${gameKey}-badge`;
    form.gameInfoText.textContent = `Modo: ${info.type} (${info.label})`;
    
    document.querySelector('label[for="participant-count"]').textContent = `Quantidade Esperada (${info.label}):`;
}

function updateCountIndicator() {
    const lines = form.participantList.value.split('\n').filter(line => line.trim() !== '');
    const label = gameInfo[form.gameSelect.value].label.toLowerCase();
    form.countIndicator.textContent = `${lines.length} ${label} listados`;
}

// Logic: Bracket Generation
function getBracketSeeding(numParticipants) {
    if (numParticipants < 2) return [[1, 2]];
    
    let rounds = Math.ceil(Math.log2(numParticipants));
    let matches = [1, 2];
    
    for (let r = 1; r < rounds; r++) {
        let currentRounds = Math.pow(2, r + 1);
        let nextMatches = [];
        for (let i = 0; i < matches.length; i++) {
            let seed = matches[i];
            nextMatches.push(seed);
            nextMatches.push(currentRounds - seed + 1);
        }
        matches = nextMatches;
    }
    
    let pairs = [];
    for(let i=0; i<matches.length; i+=2) {
        pairs.push([matches[i], matches[i+1]]);
    }
    return pairs;
}

function generateTournament() {
    const rawList = form.participantList.value.split('\n')
        .map(p => p.trim())
        .filter(p => p !== '');
        
    // Remove numbers if user typed "1. Equipe A"
    const participants = rawList.map(p => p.replace(/^\d+[\.\-]\s*/, ''));
    
    if (participants.length < 2) {
        alert('É necessário pelo menos 2 participantes para gerar uma chave.');
        return;
    }

    const game = form.gameSelect.value;
    const N = participants.length;
    const roundsCount = Math.ceil(Math.log2(N));
    const seeds = getBracketSeeding(N);

    let bracket = [];
    
    // Round 1
    let r1 = [];
    for(let i=0; i<seeds.length; i++) {
        let s1 = seeds[i][0];
        let s2 = seeds[i][1];
        
        let t1 = s1 <= N ? { seed: s1, name: participants[s1-1] } : { seed: null, name: "BYE", isBye: true };
        let t2 = s2 <= N ? { seed: s2, name: participants[s2-1] } : { seed: null, name: "BYE", isBye: true };
        
        let match = {
            id: `r1_m${i+1}`,
            round: 1,
            matchNumber: i+1,
            team1: t1,
            team2: t2,
            winnerSeed: null,
            date: "",
            time: "",
            nextMatchId: roundsCount > 1 ? `r2_m${Math.floor(i/2) + 1}` : null
        };
        
        // Auto-advance BYEs
        if (t1.isBye && !t2.isBye) match.winnerSeed = t2.seed;
        else if (t2.isBye && !t1.isBye) match.winnerSeed = t1.seed;
        
        r1.push(match);
    }
    bracket.push(r1);

    // Subsequent rounds
    for (let r = 2; r <= roundsCount; r++) {
        let roundMatches = [];
        let numMatches = Math.pow(2, roundsCount - r);
        for(let i=0; i<numMatches; i++) {
            roundMatches.push({
                id: `r${r}_m${i+1}`,
                round: r,
                matchNumber: i+1,
                team1: null,
                team2: null,
                winnerSeed: null,
                date: "",
                time: "",
                nextMatchId: r < roundsCount ? `r${r+1}_m${Math.floor(i/2) + 1}` : null
            });
        }
        bracket.push(roundMatches);
    }
    
    let thirdPlaceMatch = null;
    if (roundsCount > 1) {
        thirdPlaceMatch = {
             id: "third_place",
             round: "third",
             team1: null,
             team2: null,
             winnerSeed: null,
             date: "",
             time: "",
             nextMatchId: null
        };
    }

    appState = {
        game,
        participants,
        bracket,
        thirdPlaceMatch
    };

    propagateWinners();
    saveState();
    renderBracket();
}

function propagateWinners() {
    let { bracket, thirdPlaceMatch } = appState;
    
    // Clear future matches
    for(let r=1; r<bracket.length; r++) {
        for(let m of bracket[r]) {
            m.team1 = null;
            m.team2 = null;
            // if it was previously decided but now teams are null, reset winner
            // we'll handle this smoothly: if we clear teams, we also clear winner if it's invalid
        }
    }
    if (thirdPlaceMatch) { 
        thirdPlaceMatch.team1 = null; 
        thirdPlaceMatch.team2 = null; 
    }

    // Propagate forward
    for(let r=0; r<bracket.length - 1; r++) {
        for(let m of bracket[r]) {
            if (m.winnerSeed && m.team1 && m.team2) {
                let winner = m.team1.seed === m.winnerSeed ? m.team1 : m.team2;
                
                let nextMatch = bracket[r+1].find(mx => mx.id === m.nextMatchId);
                if (nextMatch) {
                    if (m.matchNumber % 2 !== 0) nextMatch.team1 = { ...winner };
                    else nextMatch.team2 = { ...winner };
                }
            }
        }
    }
    
    // Clean up winners that are no longer valid (e.g. if previous round changed)
    for(let r=1; r<bracket.length; r++) {
        for(let m of bracket[r]) {
            if (m.winnerSeed) {
                let hasTeam = (m.team1 && m.team1.seed === m.winnerSeed) || (m.team2 && m.team2.seed === m.winnerSeed);
                if (!hasTeam) m.winnerSeed = null;
            }
        }
    }
    
    // Third place
    if (bracket.length > 1 && thirdPlaceMatch) {
        let semis = bracket[bracket.length - 2];
        let m1 = semis[0];
        let m2 = semis[1];
        
        if (m1.winnerSeed && m1.team1 && m1.team2) {
            let loser = m1.team1.seed === m1.winnerSeed ? m1.team2 : m1.team1;
            thirdPlaceMatch.team1 = { ...loser };
        }
        if (m2.winnerSeed && m2.team1 && m2.team2) {
            let loser = m2.team1.seed === m2.winnerSeed ? m2.team2 : m2.team1;
            thirdPlaceMatch.team2 = { ...loser };
        }
        
        if (thirdPlaceMatch.winnerSeed) {
             let hasTeam = (thirdPlaceMatch.team1 && thirdPlaceMatch.team1.seed === thirdPlaceMatch.winnerSeed) || 
                           (thirdPlaceMatch.team2 && thirdPlaceMatch.team2.seed === thirdPlaceMatch.winnerSeed);
             if (!hasTeam) thirdPlaceMatch.winnerSeed = null;
        }
    }
}

// Rendering
function getRoundName(roundIdx, totalRounds) {
    if (roundIdx === totalRounds - 1) return "Final";
    if (roundIdx === totalRounds - 2) return "Semifinais";
    if (roundIdx === totalRounds - 3) return "Quartas de Final";
    if (roundIdx === totalRounds - 4) return "Oitavas de Final";
    return `Rodada ${roundIdx + 1}`;
}

function renderTeam(team, matchWinnerSeed, matchId) {
    if (!team) {
        return `<div class="team empty"><div class="seed">-</div><div class="team-name">TBD</div></div>`;
    }
    
    const isWinner = team.seed === matchWinnerSeed;
    const isLoser = matchWinnerSeed !== null && !isWinner && !team.isBye;
    
    let classes = ['team'];
    if (team.isBye) classes.push('bye');
    else if (isWinner) classes.push('winner');
    else if (isLoser) classes.push('loser');
    
    return `
        <div class="${classes.join(' ')}" data-match-id="${matchId}" data-seed="${team.seed}">
            <div class="seed">${team.seed || '-'}</div>
            <div class="team-name" title="${team.name}">${team.name}</div>
        </div>
    `;
}

function renderMatch(match) {
    return `
        <div class="match-container">
            <div class="match">
                <div class="teams">
                    ${renderTeam(match.team1, match.winnerSeed, match.id)}
                    ${renderTeam(match.team2, match.winnerSeed, match.id)}
                </div>
                <div class="match-meta">
                    <input type="date" data-match-id="${match.id}" data-field="date" value="${match.date}">
                    <input type="time" data-match-id="${match.id}" data-field="time" value="${match.time}">
                </div>
            </div>
        </div>
    `;
}

function renderBracket() {
    if (!appState.bracket || appState.bracket.length === 0) {
        emptyState.style.display = 'flex';
        bracketWrapper.innerHTML = '';
        return;
    }
    
    emptyState.style.display = 'none';
    
    let html = '';
    const totalRounds = appState.bracket.length;
    
    for(let r=0; r<totalRounds; r++) {
        html += `
            <div class="round">
                <div class="round-header">${getRoundName(r, totalRounds)}</div>
                ${appState.bracket[r].map(m => renderMatch(m)).join('')}
            </div>
        `;
    }
    
    if (appState.thirdPlaceMatch) {
        html += `
            <div class="round third-place">
                <div class="round-header">3º Lugar</div>
                <div class="third-place-container">
                    ${renderMatch(appState.thirdPlaceMatch)}
                </div>
            </div>
        `;
    }
    
    bracketWrapper.innerHTML = html;
}

// Interaction Handlers
function findMatch(matchId) {
    if (appState.thirdPlaceMatch && appState.thirdPlaceMatch.id === matchId) {
        return appState.thirdPlaceMatch;
    }
    for (let round of appState.bracket) {
        for (let m of round) {
            if (m.id === matchId) return m;
        }
    }
    return null;
}

function handleBracketClick(e) {
    const teamEl = e.target.closest('.team');
    if (!teamEl) return;
    
    if (teamEl.classList.contains('empty') || teamEl.classList.contains('bye')) return;
    
    const matchId = teamEl.dataset.matchId;
    const seed = parseInt(teamEl.dataset.seed, 10);
    
    const match = findMatch(matchId);
    if (!match) return;
    
    // Don't allow changing if one team is missing
    if (!match.team1 || !match.team2) return;
    
    // Don't allow changing if one team is a BYE (auto-advanced)
    if (match.team1.isBye || match.team2.isBye) return;
    
    // Toggle winner
    if (match.winnerSeed === seed) {
        match.winnerSeed = null;
    } else {
        match.winnerSeed = seed;
    }
    
    propagateWinners();
    saveState();
    renderBracket();
}

function handleBracketChange(e) {
    if (e.target.tagName !== 'INPUT') return;
    
    const matchId = e.target.dataset.matchId;
    const field = e.target.dataset.field; // 'date' or 'time'
    const value = e.target.value;
    
    const match = findMatch(matchId);
    if (match) {
        match[field] = value;
        saveState();
    }
}

// State Management
function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            appState = JSON.parse(saved);
        } catch(e) {
            console.error("Error parsing saved state", e);
        }
    }
}

function clearData() {
    localStorage.removeItem(STORAGE_KEY);
    appState = {
        game: 'lol',
        participants: [],
        bracket: [],
        thirdPlaceMatch: null
    };
    
    // Reset form
    form.participantList.value = '';
    form.participantCount.value = 8;
    updateCountIndicator();
    
    renderBracket();
}

function updateUI() {
    if (appState.game) {
        form.gameSelect.value = appState.game;
        updateGameInfo(appState.game);
    } else {
        updateGameInfo('lol');
    }
    
    if (appState.participants && appState.participants.length > 0) {
        // Just populate text area with names if empty
        if (form.participantList.value === '') {
            form.participantList.value = appState.participants.join('\n');
            updateCountIndicator();
        }
    }
    
    renderBracket();
}

// Boot
document.addEventListener('DOMContentLoaded', init);
