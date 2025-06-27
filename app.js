// app.js
document.addEventListener('DOMContentLoaded', () => {
  // --- Nickname Modal Logic ---
  let nickname = localStorage.getItem('nickname');
  const modal       = document.getElementById('nicknameModal');
  const nickInput   = document.getElementById('nicknameInput');
  const saveNickBtn = document.getElementById('saveNickBtn');

  if (!nickname) {
    modal.classList.remove('hidden');
  }

  saveNickBtn.onclick = () => {
    const n = nickInput.value.trim();
    if (!n) return alert('Please enter a nickname');
    localStorage.setItem('nickname', n);
    nickname = n;
    modal.classList.add('hidden');
  };

  // --- UI Elements ---
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

  // --- State ---
  let peer, connections = [], senderConn;
  let totalSize=0, sentSize=0, startTime=0;
  let transferCancelled=false;

  // --- Room Flow ---
  showJoinBtn.onclick = () => joinSection.classList.remove('hidden');

  createBtn.onclick = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    alert('Your room PIN: ' + pin);
    initPeer(pin);
  };

  joinBtn.onclick = () => {
    const pin = pinInput.value.trim();
    if (pin.length !== 4 || isNaN(pin)) return alert('Enter a valid 4-digit PIN');
    if (!confirm('Are you sure you want to join room ' + pin + '?')) return;
    initPeer(pin);
  };

  function initPeer(pin) {
    document.getElementById('roomOptions').classList.add('hidden');
    joinSection.classList.add('hidden');
    banner.classList.remove('hidden');
    banner.textContent = 'Connecting…';

    peer = new Peer(`${pin}-${Math.random().toString(36).substr(2,5)}`);
    peer.on('open', id => {
      peer.listAllPeers(ps => {
        ps.filter(p=>p.startsWith(pin+'-') && p!==id).forEach(connectToPeer);
      });
    });
    peer.on('connection', connectToPeer);
  }

  function connectToPeer(conn) {
    connections.push({conn, nickname: 'Unknown'});
    conn.on('open', () => {
      conn.send(JSON.stringify({type:'intro', nickname}));
      banner.textContent = 'Connected';
      updateDeviceList();
      showTransferUI();
    });
    conn.on('data', d => {
      // Intro message?
      if (typeof d === 'string') {
        try {
          const msg = JSON.parse(d);
          if (msg.type === 'intro') {
            const c = connections.find(x => x.conn === conn);
            c.nickname = msg.nickname;
            return updateDeviceList();
          }
        } catch {}
      }
      handleIncomingData(d);
    });
  }

  function updateDeviceList() {
    deviceList.innerHTML = '';
    connections.forEach((c,i) => {
      const li = document.createElement('li');
      li.innerHTML = `<input type="radio" name="device" value="${i}"> ${c.nickname}`;
      deviceList.appendChild(li);
    });
  }

  function showTransferUI() {
    transferSection.classList.remove('hidden');
  }

  // --- Sending Files ---
  sendBtn.onclick = () => {
    const sel = document.querySelector('input[name="device"]:checked');
    if (!sel) return alert('Select a device');
    senderConn = connections[sel.value].conn;
    const files = Array.from(fileInput.files);
    if (!files.length) return alert('Select file(s)');
    startTransfer(files);
  };

  cancelBtn.onclick = () => transferCancelled = true;

  function startTransfer(files) {
    totalSize = files.reduce((sum,f) => sum + f.size, 0);
    sentSize = 0; startTime = Date.now(); transferCancelled = false;
    totalSizeEl.textContent = formatBytes(totalSize);
    sentSizeEl.textContent = '0 B';
    progressBar.style.width = '0%';
    progressPercentEl.textContent = '0%';
    progressContainer.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    sendFileChunk(files, 0, 0);
  }

  function sendFileChunk(files, idx, offset) {
    if (transferCancelled) return resetTransfer();
    if (idx >= files.length) return completeTransfer();

    const file = files[idx];
    if (offset === 0) {
      senderConn.send(JSON.stringify({type:'file-meta', name:file.name, size:file.size}));
    }

    const chunkSize = 16 * 1024;
    const slice = file.slice(offset, offset + chunkSize);
    const reader = new FileReader();
    reader.onload = e => {
      senderConn.send(e.target.result);
      sentSize += e.target.result.byteLength;
      updateStatsUI();
      const next = offset + chunkSize;
      sendFileChunk(files, idx, next < file.size ? next : idx + 1, 0);
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

  // --- Receiving Files ---
  let recvBuffers = [], recvMeta = {};

  function handleIncomingData(data) {
    if (typeof data === 'string') {
      const msg = JSON.parse(data);
      if (msg.type === 'file-meta') {
        recvMeta = msg; recvBuffers = [];
        return;
      }
    }
    recvBuffers.push(data);
    const receivedSize = recvBuffers.reduce((sum, b) => sum + b.byteLength, 0);
    if (receivedSize >= recvMeta.size) {
      const blob = new Blob(recvBuffers);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = recvMeta.name;
      a.click();
    }
  }

  // --- UI Updates ---
  function updateStatsUI() {
    const pct = (sentSize / totalSize) * 100;
    progressBar.style.width = `${pct}%`;
    sentSizeEl.textContent = formatBytes(sentSize);
    progressPercentEl.textContent = `${Math.floor(pct)}%`;
    const elapsed = (Date.now() - startTime) / 1000;
    etaEl.textContent = `${Math.floor((totalSize - sentSize) / (sentSize / elapsed))}s`;
  }

  function formatBytes(bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB';
    return bytes + ' B';
  }
});
