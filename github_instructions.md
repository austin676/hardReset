PROJECT: CodeKill — Among Us for Coders

OVERVIEW:
We are building a real-time multiplayer browser game that combines 
Among Us style gameplay with coding practice. 4 players join a room, 
walk around a 2D top-down map, and complete coding tasks at different 
stations. One player is secretly the Imposter whose goal is to 
sabotage others using special abilities while appearing innocent.

CORE GAME FLOW:
- Players select coding topics they want to practice before joining
- 4 players join a room via a 4 letter code
- Server secretly assigns 1 Imposter and 3 Coders
- 3 rounds of 3 minutes each on a 2D map with 5 stations
- Each station has a coding task personalised to that player's topics
- Imposter completes tasks to earn ability points, spends points on abilities
- After each round players enter a discussion room, debate, and vote
- If Imposter correctly voted out team wins, otherwise Imposter wins
- Post game: Claude AI generates a personalised coding performance report

IMPOSTER ABILITIES:
- Time Bomb: freeze target's screen for 15 seconds (costs 3 points)
- Language Switch: change target's task language for 10 seconds (2 points)
- Sabotage Station: close a station for 30 seconds (4 points)
- Fake Task: play task animation without completing (free)

TECH STACK:
- Frontend: React + Vite + Tailwind + Framer Motion + Zustand
- Game Map: Phaser 3 (2D map, movement, stations) — NOT my concern
- Real-time: Socket.io
- Database: Supabase (auth, ELO, game history)
- AI: Claude API (task generation, post game report)
- Code Execution: Judge0 API
- Deployment: Railway

TEAM STRUCTURE:
- Member 1: Phaser map, character movement, station interactions
- Member 2: Node.js backend, Socket.io, game state, room logic
- Member 3: Task system, Judge0 integration, Claude API, task modal
- Member 4: ME — Meeting UI, voting, chat, ejection, mobile controller, 
            end screen, AI report display, all UI outside game canvas

MY SOCKET EVENTS:
I RECEIVE from backend (Member 2):
- meetingCalled → { calledBy, activityLog, players }
- voteResult → { ejectedPlayer, wasImposter, votes }
- gameEnd → { winner, imposterReveal, stats }
- playerEjected → { playerId }
- roundStart → { roundNumber }
- roundEnd → { roundNumber }
- timerUpdate → { timeLeft }

I RECEIVE from Member 3:
- aiReport → { reports: { [playerId]: reportText } }

I SEND to backend:
- callMeeting → { calledBy }
- castVote → { voterId, targetId }
- chatMessage → { playerId, message }
- controllerInput → { direction, action } (mobile controller)

MY RESPONSIBILITIES:
1. Meeting popup UI — appears when meetingCalled fires, shows 
   activity log and player list
2. Text chat — real time chat during discussion phase
3. Voting panel — click to vote, show live vote counts
4. Ejection screen — dramatic full screen reveal after voting
5. Mobile controller — separate /controller route, joystick + 
   buttons, connects to same Socket.io room
6. End game stats screen — winner, ELO changes, tasks completed
7. AI report display — render Claude's personalised coding report
8. All global UI — HUD timer, round indicator, ability bar for imposter

COMPONENT STRUCTURE I AM BUILDING:
src/pages/
  - Home.jsx
  - Login.jsx  
  - Lobby.jsx
  - Discussion.jsx
  - Results.jsx
  - Controller.jsx (mobile controller page)

src/components/
  - MeetingPopup.jsx
  - ChatBox.jsx
  - VotingPanel.jsx
  - EjectionScreen.jsx
  - PlayerHUD.jsx
  - AbilityBar.jsx
  - EndScreen.jsx
  - AIReport.jsx
  - ActivityLog.jsx

DESIGN LANGUAGE:
- Dark theme throughout, space/sci-fi aesthetic matching Among Us
- Primary color: deep purple #1a0a2e
- Accent: electric blue #00d4ff
- Danger/Imposter: red #ff3366
- Success: green #00ff88
- Font: monospace for code elements, clean sans-serif for UI
- Animations: Framer Motion for all transitions and reveals
- Dramatic and cinematic — role reveals should feel intense

IMPORTANT RULES FOR COPILOT:
- Never use localStorage — use Zustand for client state
- All game state comes from Socket.io events, never trust client
- Use Tailwind utility classes only, no custom CSS files unless necessary
- Every component should handle loading state and empty state
- Socket connection is a singleton from src/hooks/useSocket.js
- Supabase client is from src/lib/supabase.js
- Mobile controller page is completely separate route /controller