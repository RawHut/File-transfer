// app.js
let nickname = localStorage.getItem('nickname');
const modal       = document.getElementById('nicknameModal');
const nickInput   = document.getElementById('nicknameInput');
const saveNickBtn = document.getElementById('saveNickBtn');
const banner      = document.getElementById('banner');
const createBtn   = document.getElementById('createBtn');
const showJoinBtn = document.getElementById('showJoinBtn');
const joinSection = document.getElementById('joinSection');
const pinInput    = document.getElementById('pinInput');
const joinBtn     = document.getElementById('joinBtn');
const transferSection = document.getElementById('transferSection');
const deviceList  = document.getElementById('deviceList');
const fileInput   = document.getElementById('fileInput');
const sendBtn     = document.getElementById('sendBtn');
const cancelBtn   = document.getElementById('cancelBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const totalSizeEl = document.getElementById('totalSize');
const sentSizeEl  = document.getElementById('sentSize');
const progressPercentEl = document.getElementById('progressPercent');
const etaEl       = document.getElementById('eta');

let peer, connections = [], senderConn, totalSize=0, sentSize=0, startTime=0, transferCancelled=false;

// Nickname modal
if (!nickname) {
  modal.classList.remove('hidden');
}
saveNickBtn.onclick = () => {
  const n = nickInput.value.trim();
  if (n) {
    nickname = n;
    localStorage.setItem('nickname', nickname);
    modal.classList.add('hidden');
  }
};

// Show Join PIN entry
showJoinBtn.onclick = () => joinSection.classList.remove('hidden');

// Create room
createBtn.onclick = () => {
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  alert('Your room PIN: ' + pin);
  initPeer(pin);
};

// Join room with confirmation warning
joinBtn.onclick = () => {
  const pin = pinInput.value.trim();
  if (pin.length !== 4 || isNaN(pin)) return alert('Enter valid 4-digit PIN');
  if (!confirm('Are you sure you want to join room ' + pin + '?')) return;
  initPeer(pin);
};

function initPeer(pin) {
  document.getElementById('roomOptions').classList.add('hidden');
  joinSection.classList.add('hidden');
  banner.classList.remove('hidden');
  banner.textContent = 'Connecting...';

  peer = new Peer(\`\${pin}-\${Math.random().toString(36).substr(2,5)}\`);
  peer.on('open', id => peer.listAllPeers(ps => {
    ps.filter(p=>p.startsWith(pin+'-')&&p!==id).forEach(connectToPeer);
  }));
  peer.on('connection', connectToPeer);
}

function connectToPeer(conn) {
  connections.push({conn, nickname: 'Unknown'});
  conn.on('open', () => {
    conn.send(JSON.stringify({type:'intro', nickname}));
    updateBanner('Connected');
    updateDeviceList();
  });
  conn.on('data', d=>{
    if (typeof d === 'string') {
      try {
        const msg = JSON.parse(d);
        if (msg.type==='intro') {
          const c = connections.find(x=>x.conn===conn);
          c.nickname = msg.nickname;
          updateDeviceList();
          return;
        }
      } catch{}
    }
    // File transfer data
    handleIncomingData(conn, d);
  });
  showTransferUI();
}

function updateBanner(text) {
  banner.textContent = text;
}

function updateDeviceList() {
  deviceList.innerHTML = '';
  connections.forEach((c,i)=>{
    const li = document.createElement('li');
    li.innerHTML = \`<input type="radio" name="device" value="\${i}">\${c.nickname}\`;
    deviceList.appendChild(li);
  });
}

function showTransferUI() {
  transferSection.classList.remove('hidden');
}

// Sending
sendBtn.onclick = () => {
  const idx = document.querySelector('input[name="device"]:checked');
  if (!idx) return alert('Select a device');
  senderConn = connections[idx.value].conn;
  const files = Array.from(fileInput.files);
  if (!files.length) return alert('Select file(s)');
  startTransfer(files);
};

cancelBtn.onclick = () => {
  transferCancelled = true;
};

// Transfer logic
let recvBuffers = [], recvMeta={}, currentFileIndex=0;
function startTransfer(files) {
  totalSize = files.reduce((sum,f)=>sum+f.size,0);
  sentSize = 0; startTime = Date.now(); transferCancelled=false;
  totalSizeEl.textContent = formatBytes(totalSize);
  sentSizeEl.textContent = '0 B';
  progressBar.style.width='0%'; progressPercentEl.textContent='0%';
  progressContainer.classList.remove('hidden'); cancelBtn.classList.remove('hidden');
  sendFileChunk(files, 0, 0);
}

function sendFileChunk(files, fileIdx, offset) {
  if (transferCancelled) return resetTransfer();
  if (fileIdx>=files.length) return completeTransfer();
  const file = files[fileIdx];
  if (offset===0) {
    // send file meta
    senderConn.send(JSON.stringify({type:'file-meta', name:file.name, size:file.size}));
  }
  const chunkSize = 16*1024, slice = file.slice(offset, offset+chunkSize);
  const reader = new FileReader();
  reader.onload = e=>{
    senderConn.send(e.target.result);
    sentSize += e.target.result.byteLength;
    updateStatsUI();
    const next = offset+chunkSize;
    if (next < file.size) {
      sendFileChunk(files, fileIdx, next);
    } else {
      sendFileChunk(files, fileIdx+1, 0);
    }
  };
  reader.readAsArrayBuffer(slice);
}

function completeTransfer() {
  cancelBtn.classList.add('hidden');
  alert('Transfer complete!');
}

function resetTransfer() {
  cancelBtn.classList.add('hidden');
  alert('Transfer cancelled.');
}

// Receiving
function handleIncomingData(conn, data) {
  if (typeof data === 'string') {
    const msg=JSON.parse(data);
    if (msg.type==='file-meta') {
      recvMeta = msg; recvBuffers=[]; return;
    }
  } else {
    recvBuffers.push(data);
    const receivedSize = recvBuffers.reduce((sum, b)=>sum+b.byteLength,0);
    updateReceiveUI(receivedSize);
    if (receivedSize >= recvMeta.size) {
      const blob=new Blob(recvBuffers); const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=recvMeta.name; a.click();
    }
  }
}

function updateStatsUI() {
  const pct = (sentSize/totalSize)*100;
  progressBar.style.width=\`\${pct}%\`;
  sentSizeEl.textContent = formatBytes(sentSize);
  progressPercentEl.textContent = \`\${Math.floor(pct)}%\`;
  const elapsed=(Date.now()-startTime)/1000;
  etaEl.textContent = \`\${Math.floor((totalSize-sentSize)/(sentSize/elapsed))}s\`;
}

function updateReceiveUI(received) {
  // optional: show progress on receiver side
}

function formatBytes(bytes) {
  if (bytes>=1e9) return (bytes/1e9).toFixed(2)+' GB';
  if (bytes>=1e6) return (bytes/1e6).toFixed(2)+' MB';
  if (bytes>=1e3) return (bytes/1e3).toFixed(2)+' KB';
  return bytes+' B';
}
