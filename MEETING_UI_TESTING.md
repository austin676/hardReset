# 🧪 Meeting UI Testing Guide

## 📋 Test Scenarios

### 🗳️ **Voting System Tests**

#### **Test 1: Basic Voting Flow**
```typescript
// Expected behavior:
// 1. Meeting starts → Discussion phase
// 2. Timer counts down → Auto-switches to voting
// 3. Players vote → Real-time updates
// 4. All votes in → Results display
// 5. Ejection animation → Return to game

// Test steps:
1. Trigger meeting with `socket.emit('meetingCalled', { roomId })`
2. Verify discussion phase UI appears
3. Wait for voting phase transition
4. Cast votes and verify real-time updates
5. Check ejection sequence
```

#### **Test 2: Real-time Vote Visualization**
```typescript
// Expected: Vote icons appear under players immediately
// Expected: Vote counts update in real-time
// Expected: Progress bars reflect current status

// Test with multiple players voting simultaneously
const testVotes = [
  { voterId: 'player1', targetId: 'player2' },
  { voterId: 'player3', targetId: 'player2' }, 
  { voterId: 'player4', targetId: 'skip' },
]

// Verify each vote triggers UI updates
testVotes.forEach(vote => {
  socket.emit('vote', vote)
  // Check: Vote count increases
  // Check: Vote icon appears
  // Check: Progress bar updates
})
```

#### **Test 3: Vote Prevention**
```typescript
// Test cases that should be blocked:
// ❌ Self-voting (player voting for themselves)
// ❌ Dead players voting  
// ❌ Duplicate votes from same player
// ❌ Voting outside of voting phase

// Test implementation:
const testBlockedVotes = [
  { voterId: 'player1', targetId: 'player1' },    // Self vote
  { voterId: 'deadPlayer', targetId: 'player2' }, // Dead voter
  { voterId: 'player1', targetId: 'player3' },    // Duplicate vote
]

testBlockedVotes.forEach(vote => {
  socket.emit('vote', vote)
  // Expected: Vote rejected by client
  // Expected: UI shows no change
})
```

### ⏱️ **Timer System Tests**

#### **Test 4: Timer Synchronization**
```typescript
// Expected: Timer stays in sync across all clients
// Expected: Visual urgency increases as time reduces

// Backend emits timer updates every second:
setInterval(() => {
  socket.emit('meetingTimerSync', { timer: currentTimer })
  currentTimer--
}, 1000)

// Verify:
// ✅ Timer displays correctly
// ✅ Color changes at 30s (urgent) and 10s (critical)
// ✅ Animations intensify as time runs out
```

#### **Test 5: Phase Transitions**
```typescript
// Expected automatic transitions:
// Discussion (60s) → Voting (30s) → Results → Game

// Test sequence:
1. Meeting starts in discussion phase
2. At 30s remaining → Auto-switch to voting
3. Timer hits 0 OR all votes in → Results
4. After 5s delay → Return to game

// Verify UI updates for each phase
```

### 🚀 **Animation Tests**

#### **Test 6: Ejection Animation Sequence**
```typescript
// Expected 4-stage animation:
// Stage 1: Particle explosion (0.2s)
// Stage 2: Spaceship entrance (0.8s) 
// Stage 3: Text reveal (1.8s)
// Stage 4: Role reveal (2.8s)

// Test data:
const ejectionData = {
  ejectedId: 'player2',
  ejectedName: 'TestPlayer',
  ejectedColor: '#ff6b6b',
  role: 'imposter', // or 'coder'
  wasImposter: true
}

// Verify:
// ✅ Smooth animation timing
// ✅ Proper role color coding 
// ✅ Sound effects (if implemented)
// ✅ Animation completes and returns to game
```

### 💬 **Chat Integration Tests**

#### **Test 7: Meeting Chat**
```typescript
// Expected: Chat works during discussion phase
// Expected: Chat disabled during voting phase
// Expected: Dead players cannot chat

// Test messages:
const testMessages = [
  { playerId: 'alive1', message: 'I saw red vent!', phase: 'discussion' },
  { playerId: 'dead1', message: 'Should be blocked', phase: 'discussion' },
  { playerId: 'alive2', message: 'Should be blocked', phase: 'voting' },
]

// Verify message filtering and display
```

## 🔧 **Debug Tools**

### **Socket Event Monitor**  
```typescript
// Add to useSocket.ts for debugging
socket.onAny((eventName, ...args) => {
  console.log(`📡 [${eventName}]`, ...args)
})

// Monitor specific meeting events
const meetingEvents = [
  'meetingStarted',
  'voteUpdate', 
  'meetingEnded',
  'playerEjected',
  'meetingTimerSync'
]

meetingEvents.forEach(event => {
  socket.on(event, (data) => {
    console.log(`🗳️ [${event}]`, data)
  })
})
```

### **Game Store Monitor**
```typescript
// Add to gameStore.ts 
const logStateChanges = (fn: string) => (state: any) => {
  console.log(`🎮 [${fn}]`, state)
}

// Wrap key actions
setGamePhase: logStateChanges('setGamePhase')((phase) => {
  set({ gamePhase: phase })
}),

setVoteTally: logStateChanges('setVoteTally')((tally) => {
  set({ voteTally: tally })
}),
```

### **UI State Inspector**
```typescript
// Add to MeetingOverlay.tsx
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    window.meetingDebug = {
      gamePhase,
      voteTally,
      votes,
      voteDistribution,
      meetingTimer,
      showVotePanel,
      myVote,
      alivePlayers: alivePlayers.length,
      votedCount,
      totalAlive,
      voteProgress,
    }
  }
}, [/* all dependencies */])

// Access in browser console: window.meetingDebug
```

## 🎯 **Performance Tests**

### **Test 8: Large Player Count**
```typescript
// Test with 10+ players
// Expected: UI remains responsive
// Expected: Vote visualization doesn't overlap
// Expected: Smooth animations

// Generate test players:
const generateTestPlayers = (count: number) => 
  Array.from({ length: count }, (_, i) => ({
    id: `player${i}`,
    name: `Player ${i}`,
    color: `hsl(${i * 36}, 70%, 50%)`,
    isAlive: Math.random() > 0.3, // 70% alive
    tasksCompleted: Math.floor(Math.random() * 5)
  }))
```

### **Test 9: Rapid Vote Updates**
```typescript
// Test rapid-fire vote events
// Expected: UI updates smoothly without lag
// Expected: No duplicate animations

// Simulate simultaneous votes:
const rapidVotes = Array.from({ length: 8 }, (_, i) => ({
  voterId: `player${i}`,
  targetId: `player${(i + 1) % 8}`
}))

rapidVotes.forEach((vote, index) => {
  setTimeout(() => {
    socket.emit('voteUpdate', { 
      tally: { [vote.voterId]: true },
      votes: { [vote.voterId]: vote.targetId }
    })
  }, index * 100) // 100ms intervals
})
```

## 🔍 **Error Handling Tests**

### **Test 10: Network Issues**
```typescript
// Test socket disconnection during meeting
// Expected: Graceful degradation
// Expected: Reconnection handling

// Simulate disconnection:
socket.disconnect()

// Wait 2 seconds, then reconnect:
setTimeout(() => {
  socket.connect()
  // Verify: Meeting state recovers
  // Verify: No duplicate votes
}, 2000)
```

### **Test 11: Invalid Data**
```typescript
// Test malformed socket events
// Expected: No crashes, graceful ignoring

const invalidEvents = [
  { event: 'voteUpdate', data: null },
  { event: 'meetingStarted', data: { players: 'not-array' } },
  { event: 'playerEjected', data: { ejectedId: undefined } },
]

invalidEvents.forEach(({ event, data }) => {
  socket.emit(event, data)
  // Verify: App continues working
  // Verify: Error logged but not thrown
})
```

## 📱 **Mobile/Responsive Tests**

### **Test 12: Mobile Interface**
```typescript
// Test on mobile screens (375px width)
// Expected: All buttons are touchable
// Expected: Text is readable
// Expected: Animations perform well

// Test orientations:
// Portrait: Voting panel stacked
// Landscape: Side-by-side layout

// Touch targets min 44px
// Font sizes min 14px
// Animations 60fps
```

## ✅ **Test Checklist**

**Pre-Launch Verification:**

- [ ] ✅ Meeting triggers correctly from game
- [ ] ✅ Discussion phase shows chat + players  
- [ ] ✅ Voting phase auto-opens voting panel
- [ ] ✅ Vote visualization updates in real-time
- [ ] ✅ Timer synchronizes across clients
- [ ] ✅ Phase transitions work automatically
- [ ] ✅ Ejection animation plays completely
- [ ] ✅ Role reveal shows correct information
- [ ] ✅ Meeting ends and returns to game
- [ ] ✅ Mobile interface is usable
- [ ] ✅ Error handling prevents crashes
- [ ] ✅ Performance is smooth with 10+ players

**Socket Events Working:**
- [ ] ✅ `meetingStarted` → Shows overlay
- [ ] ✅ `voteUpdate` → Updates vote counts
- [ ] ✅ `meetingTimerSync` → Timer accuracy  
- [ ] ✅ `meetingEnded` → Triggers results
- [ ] ✅ `playerEjected` → Shows animation

**UI Features Working:**
- [ ] ✅ Real-time vote icons under players
- [ ] ✅ Vote count badges on player cards
- [ ] ✅ Progress bars for voting completion
- [ ] ✅ Phase-aware timer styling
- [ ] ✅ Automatic voting panel switch
- [ ] ✅ Vote prevention (self, duplicate, dead)
- [ ] ✅ Enhanced ejection with particles/spaceship
- [ ] ✅ Role reveal with proper styling

---

**🎉 When all tests pass, your enhanced meeting system is ready for production!**