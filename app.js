// app.js
const createBtn      = document.getElementById('createBtn');
const showJoinBtn    = document.getElementById('showJoinBtn');
const joinSection    = document.getElementById('joinSection');
const pinInput       = document.getElementById('pinInput');
const joinBtn        = document.getElementById('joinBtn');
const transferSection= document.getElementById('transferSection');
const fileInput      = document.getElementById('fileInput');
const sendBtn        = document.getElementById('sendBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar    = document.getElementById('progressBar');
const totalSizeEl    = document.getElementById('totalSize');
const receivedSizeEl = document.getElementById('receivedSize');
const progressPercentEl = document.getElementById('progressPercent');
const etaEl          = document.getElementById('eta');

let peer, conn;
let totalSize = 0, receivedSize = 0, startTime = 0;

// Show Join PIN field
showJoinBtn.onclick = () => {
  joinSection.classList.remove('hidden');
};

// Create room with random PIN
createBtn.onclick = () => {
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  initPeer(pin);
  alert(`Your room PIN is: ${pin}`);
};

// Join existing room
joinBtn.onclick = () => {
  const pin = pinInput.value.trim();
  if (pin.length !== 4 || isNaN(pin)) {
    return alert('Enter a valid 4-digit PIN');
  }
  initPeer(pin);
};

function initPeer(pin) {
  // Hide room selection UI
  document.getElementById('roomOptions').classList.add('hidden');
  joinSection.classList.add('hidden');

  // Initialize PeerJS
  peer = new Peer(`${pin}-${Math.random().toString(36).substr(2, 5)}`);

  peer.on('open', id => {
    peer.listAllPeers(peers => {
      const others = peers.filter(p => p.startsWith(pin + '-') && p !== id);
      if (others.length) {
        conn = peer.connect(others[0]);
        setupConnection();
      }
    });
  });

  peer.on('connection', connection => {
    conn = connection;
    setupConnection();
  });
}

function setupConnection() {
  transferSection.classList.remove('hidden');

  conn.on('data', data => {
    if (!totalSize) return;
    receivedSize += data.byteLength;
    progressBar.style.width = `${(receivedSize/totalSize)*100}%`;
    progressPercentEl.textContent = `${Math.floor((receivedSize/totalSize)*100)}%`;
    receivedSizeEl.textContent = formatBytes(receivedSize);
    updateETA();

    // On complete
    if (receivedSize >= totalSize) {
      const blob = new Blob(receivedBuffers);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'received_file';
      a.click();
    }
  });
}

sendBtn.onclick = () => {
  const file = fileInput.files[0];
  if (!file) return alert('Select a file to send');
  totalSize = file.size;
  receivedSize = 0;
  receivedBuffers = [];
  startTime = Date.now();

  totalSizeEl.textContent = formatBytes(totalSize);
  receivedSizeEl.textContent = '0 B';
  progressBar.style.width = '0%';
  progressPercentEl.textContent = '0%';
  progressContainer.classList.remove('hidden');

  const chunkSize = 16 * 1024;
  let offset = 0;
  const reader = new FileReader();

  reader.onload = e => {
    conn.send(e.target.result);
    receivedBuffers.push(e.target.result);
    offset += chunkSize;
    progressBar.style.width = `${(offset/totalSize)*100}%`;
    progressPercentEl.textContent = `${Math.floor((offset/totalSize)*100)}%`;
    updateETA();

    if (offset < totalSize) {
      readSlice(offset);
    }
  };

  function readSlice(o) {
    const slice = file.slice(o, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  }
  readSlice(0);
};

function updateETA() {
  const elapsed = (Date.now() - startTime) / 1000;
  const speed = receivedSize / elapsed;
  const remaining = (totalSize - receivedSize) / speed;
  etaEl.textContent = `${Math.max(0, Math.floor(remaining))}s`;
}

function formatBytes(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB';
  return bytes + ' B';
}
